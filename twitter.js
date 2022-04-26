let { TwitterApi, EDirectMessageEventTypeV1 } = require('twitter-api-v2');
let { TwitterApiRateLimitPlugin } = require('@twitter-api-v2/plugin-rate-limit')
let dotenv = require('dotenv');
dotenv.config();


const API_KEY = process.env.API_KEY;
const API_KEY_SECRET = process.env.API_KEY_SECRET;
const BEARER_TOKEN = process.env.BEARER_TOKEN;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

// Instanciate with desired auth type (here's Bearer v2 auth)
const rateLimitPlugin = new TwitterApiRateLimitPlugin()
const twitterClient = new TwitterApi({
  clientId: process.env.BACKEND_CLIENT_ID
}, {plugins: [rateLimitPlugin]});

const dmClient = new TwitterApi({
  appKey: API_KEY,
  appSecret: API_KEY_SECRET,
  accessToken: ACCESS_TOKEN, // oauth token from previous step (link generation)
  accessSecret: ACCESS_TOKEN_SECRET, // oauth token secret from previous step (link generation)
}, {plugins: [rateLimitPlugin]});

// Tell typescript it's a readonly app
// const roClient = twitterClient.readWrite;
const rwClient = twitterClient.readWrite
let myUserId;

let getId = async () => {
    if(myUserId) {
        return myUserId;
    }
    let thisUser = await twitterClient.v2.me();
    myUserId = thisUser.data.id;
}

const sendDMToUser = async (userId, message) => {
    // let testUserId = await twitterClient.v2.userByUsername('roxkstar74').then(user => user.data.id);
    await dmClient.v1.sendDm({
        event: EDirectMessageEventTypeV1.DirectMessageEvents,
        recipient_id: userId,
        text: message
    });
}

const generateAuthURL = () => {

    let data = twitterClient.generateOAuth2AuthLink('http://localhost:6969/v2/callback', {
        response_type: 'code',
        scope: ['tweet.read', 'follows.read', 'offline.access', 'users.read'],
        force_login: true,
    })

    console.log(data);

    return data;
}

const generateLoginData = async (code, codeVerifier) => {
    console.log(code);
    let loginData = await twitterClient.loginWithOAuth2({
        code: code,
        redirectUri: 'http://localhost:6969/v2/callback',
        codeVerifier: codeVerifier
    }).catch(err => {
        console.log(err);
        throw new Error('Failed to double oauth');
    });
    // get id
    let id = await loginData.client.v2.me().then(user => user.data.id);
    return {...loginData, id};
}


module.exports = {
    sendDMToUser,
    generateAuthURL,
    generateLoginData,
};
