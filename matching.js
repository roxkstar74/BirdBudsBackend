// From a list of twitter users, we must find all mutual followers
// then maximize for number of matches
export const findMatches = (usersToMutualFollowersMap) => {
    // this is literally a graph matching algorithm
    // I LOVE COMPUTERS
    // ok literally edmonds
    // so the question is how do we generate the "graph"?
    // we have a list of twitter users and their mutual followers
    // for each user, create an edge from each of their mutual followers also following birdbuds
    // then we can use the edmonds algorithm to find the maximum matching
    let edges = [];
    for (let user in usersToMutualFollowersMap) {
        for (let mutualFollower of usersToMutualFollowersMap[user]) {
            edges.push({
                source: user,
                target: mutualFollower
            });
        }
    }

}

// Algo
// 1. We have to only care about people following @birdbuds, filter out anyone else
    // This is actually kinda easy because we can just take out followers list and filter all other lists
    // We can use the twitter API to only get those followers that are within this list, that is literally an endpoint feature
// 2. Once we've done all of that, we just need to generate an undirected graph of all the followers
    // So basically for each user we just make edges from everyone they follow after the filtering
// 3. Run the algorithm!