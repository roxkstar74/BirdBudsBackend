import { TwitterApiReadWrite } from "twitter-api-v2";

let { TwitterApi, EDirectMessageEventTypeV1 } = require('twitter-api-v2');
let { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit')
const { MongoClient } = require("mongodb");

let dotenv = require('dotenv');
dotenv.config();
// Replace the uri string with your MongoDB deployment's connection string.
const uri =
    `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PW}@${process.env.MONGO_URL}?retryWrites=true&writeConcern=majority`;
const client = new MongoClient(uri);
const BIRDBUDSID = '1516210896632266756';


// Instanciate with desired auth type (here's Bearer v2 auth)
const rateLimitPlugin = new TwitterApiRateLimitPlugin()
const publicTwitterClient = new TwitterApi({
    clientId: process.env.BACKEND_CLIENT_ID
}, { plugins: [rateLimitPlugin] }) as TwitterApiReadWrite;


const API_KEY = process.env.API_KEY;
const API_KEY_SECRET = process.env.API_KEY_SECRET;
const BEARER_TOKEN = process.env.BEARER_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

const birdBudsClient = new TwitterApi({
    appKey: API_KEY,
    appSecret: API_KEY_SECRET,
    accessToken: ACCESS_TOKEN, // oauth token from previous step (link generation)
    accessSecret: ACCESS_TOKEN_SECRET, // oauth token secret from previous step (link generation)
}, { plugins: [rateLimitPlugin] });

const getAndUpdateAllFollowingData = async () => {
    // get initial data and perform updates
    let birdBudsFollowerIDs = await getAllBirdBudsFollowersIDs();
    console.log(birdBudsFollowerIDs);
    let newTokenData = await refreshTokensForAllFollowerIDsAndMakeNewClients(birdBudsFollowerIDs);
    console.log(newTokenData);
    // let newTokenDataHasBeenStored = await storeAllUpdatedTokensBackInMongo(newTokenData);

    // // generate following graph with userClients and followerIDs list
    // let usersToMutualishFollowers = await getMutualishFollowersForAllIDs(birdBudsFollowerIDs, newTokenData);

    // now do graph algorithms/matching

}

// A mutualish follower is someone this person follows that also follows birdbuds
// tokenData: [{ client, accessToken, accessSecret, refreshToken, id }]
const getMutualishFollowersForAllIDs = async (birdBudsFollowerIDs: [string], tokenData: [any]) => {
    let usersToMutualishFollowers: any = {};
    // for each follower id, get everyone they follow that is also a birdbudfollower (batched by 100s bc twitter)
    // once we have this list we will just generate edges and perform matching based on all pairings
    // although we can probably do some preprocessing to only have mutual following edges without any crazy algos
    for (let birdBudsFollowerID of birdBudsFollowerIDs) {
        // get all birdbuds followers from mongodb
        // filter by only data with an id in birdBudsFollowersIDs
        let userTokenData = tokenData.find(userTokenData => userTokenData.id === birdBudsFollowerID);
        if (!userTokenData) {
            continue;
        }
        let userClient = userTokenData.client as TwitterApiReadWrite;
        let userFollowingIDsPaginator = await userClient.v2.following(BIRDBUDSID, { max_results: 1000, asPaginator: true }); //asPaginator: true,
        await userFollowingIDsPaginator.fetchLast(14000);
        let userFollowingFullInfoArray = userFollowingIDsPaginator.data.data; //.data;
        // get only userFollowingIDs that are also birdbuds followers
        let userFollowingIDs = userFollowingFullInfoArray.map(userFollowing => userFollowing.id)
            .filter(userFollowingID => birdBudsFollowerIDs.includes(userFollowingID));
        console.log(`User ${birdBudsFollowerID} has ${userFollowingIDs.length} following that are also birdbuds followers: `, userFollowingIDs);
        usersToMutualishFollowers[birdBudsFollowerID] = userFollowingIDs;
    }

    return usersToMutualishFollowers;
}

// generate a map of twitter userIDs : [their mutual followers' ids]

const getAllBirdBudsFollowersIDs = async () => {
    // use twitter api @birdbuds
    //check rate limit
    let rateLimit = await rateLimitPlugin.v2.getRateLimit('users/:id/followers');
    console.log(rateLimit);

    let birdBudsFollowersIDsPaginator = await birdBudsClient.v2.followers(BIRDBUDSID, { max_results: 1000 }); //asPaginator: true,
    // await birdBudsFollowersIDsPaginator.fetchLast(1000);
    let birdBudsFollowersFullInfo = birdBudsFollowersIDsPaginator.data; //.data;
    let birdBudsFollowersIDs = birdBudsFollowersFullInfo.map((birdBudsFollower: any) => birdBudsFollower.id);
    console.log(`Birdbuds has ${birdBudsFollowersIDs.length} followers: `, birdBudsFollowersIDs);
    return birdBudsFollowersIDs;
};

const refreshTokensForAllFollowerIDsAndMakeNewClients = async (birdBudsFollowersIDs: [string]) : Promise<[any]> => {
    // in mongodb birdbuds table logins, find all birbuds followers by id, then refresh their tokens
    const newTokenData: any[] = [];

    // get all birdbuds followers from mongodb
    // filter by only data with an id in birdBudsFollowersIDs
    let newTokenDataPromise = new Promise<any>((resolve, reject) => {
        try {
            client.connect((err: any) => {
                if (err) {
                    console.log(err);
                    reject(err);
                    return;
                }
                const collection = client.db("birdbuds").collection("logins");
                collection.find({ id: { $in: birdBudsFollowersIDs } }).toArray(async (err: any, docs: any) => {
                    if (err) {
                        console.log(err);
                    }
                    let birdBudsFollowers = docs;
                    console.log(`Found ${birdBudsFollowers.length} birdbuds followers: `, birdBudsFollowers);
                    for (let birdBudsFollower of birdBudsFollowers) {
                        // refresh their tokens
                        try {
                            let refreshTokenData = await publicTwitterClient.refreshOAuth2Token(birdBudsFollower.refreshToken);
                            newTokenData.push({ ...refreshTokenData, id: birdBudsFollower.id });
                        }
                        catch (e: any) {
                            console.log(`Error refreshing token for ${birdBudsFollower.id} with token ${birdBudsFollower.refreshToken}`);
                            console.log(`Probably error: ${e?.data?.error_description} \n Full Error -`, e);
                        }
                    }
                    resolve(newTokenData);
                });
            });
        } catch (e) {
            console.log(e);
            reject(e);
        }
    });

    return newTokenDataPromise;
};

// in mongodb birdbuds table logins, find all birbuds followers by id, then refresh their tokens
const storeAllUpdatedTokensBackInMongo = async (newTokenData: [any]) => {
    // generate mongo update commands
    let updateCommands = newTokenData.map(token => ({
        updateOne: {
            filter: { id: token.id },
            update: {
                $set: {
                    accessToken: token.accessToken,
                    accessSecret: token.accessSecret,
                    refreshToken: token.refreshToken
                }
            }
        }
    }))
    const newTokenDataHasBeenStored = new Promise((resolve, reject) => {
        try {
            client.connect((err: any) => {
                    const collection = client.db("birdbuds").collection("logins");
                    resolve(collection.bulkWrite(updateCommands, (err: any, docs: any) => { console.error(err) }
                ));
            });
        } catch (e) {
            console.log(e);
            reject(e);
        }
    });
    return newTokenDataHasBeenStored;
};

getAndUpdateAllFollowingData();