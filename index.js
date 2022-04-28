/*
 * example OAuth and OAuth2 client which works with express v3 framework
 * npm i express path dotenv util oauth 
 */

let express = require('express')
let path = require('path')
let dotenv = require('dotenv');
let sys = require('util');
let oauth = require('oauth');
let bodyParser = require('body-parser')
let cookieParser = require('cookie-parser')
let session = require('express-session')
let app = express();
let MongoDBStore = require('connect-mongodb-session')(session);

let { sendDMToUser, generateAuthURL, generateLoginData } = require('./twitter.js')
const { MongoClient } = require("mongodb");
dotenv.config();

// Replace the uri string with your MongoDB deployment's connection string.
const uri =
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PW}@${process.env.MONGO_URL}?retryWrites=true&writeConcern=majority`;
const client = new MongoClient(uri);
let store = new MongoDBStore({
  uri: uri,
  collection: 'mySessions'
});

const BIRDBUDSID = '1516210896632266756';


// all environments
app.set('port', process.env.PORT || 80);
app.use(bodyParser());
app.use(cookieParser());
app.use(session({  
  saveUninitialized: true, 
  resave: true, 
  secret: process.env.EXPRESS_SESSION_SECRET, 
  store: store
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(require('stylus').middleware(__dirname + '/public'));


app.get('/', function(req, res){
  res.status(200).send('BirdBuds backend is up!');
});

let _twitterConsumerKey = process.env.API_KEY;
let _twitterConsumerSecret = process.env.API_KEY_SECRET;

function consumer() {
  return new oauth.OAuth(
    'https://api.twitter.com/oauth/request_token', 
    'https://api.twitter.com/oauth/access_token', 
     _twitterConsumerKey, 
     _twitterConsumerSecret, 
     "1.0A", 
     process.env.HOSTPATH+'/sessions/callback', 
     "HMAC-SHA1"
   );
}

let storeDataInMongo = async (loginData) => {
    async function run() {
        try {
          await client.connect();
          const database = client.db('birdbuds');
          const logins = database.collection('logins');
          // Query for a movie that has the title 'Back to the Future
          const query = { id: loginData.id };
          const update = { $set: loginData};
          const options = { upsert: true };
          await logins.updateOne(query, update, options);
          console.log('Login stored!');
        } finally {
          // Ensures that the client will close when you finish/error
          await client.close();
        }
      }
      return run().catch(console.dir);      
};

app.get('/v2', function(req, res){
  res.status(200).send('BirdBuds v2 is up!');
});

app.get('/v2/login', function(req, res){
  let authURLBlob = generateAuthURL();
  let id = req.query.id;
  console.log(authURLBlob.url);
  console.log('session:', req.session);
  req.session.state = authURLBlob.state;
  req.session.codeVerifier = authURLBlob.codeVerifier;
  res.session.userID = id;
  console.log('session updated:', req.session);
  res.redirect(authURLBlob.url);
});

app.get('/v2/callback', async function(req, res) {
  console.log('CALLBACK HIT', req.url);  // Extract state and code from query string
  const { code, error } = req.query;
  const newState = req.query.state;
  // Get the saved codeVerifier from session
  const { codeVerifier: newCodeVerifier, state: sessionState } = req.session;
  console.log('newCodeVerifier', newCodeVerifier);
  console.log('sessionState', sessionState);

  if (!newCodeVerifier || !sessionState) {
    res.status(400).send('You denied the app or your session expired! Please ');
    return;
  }
  if (state !== sessionState) {
    res.status(400).send('Stored tokens didnt match! Please unfollow birdbuds, wait 1 minute, and follow again to get a new link.');
    return;
  }
  if(error) {
    res.status(400).send('You denied the app or your session expired! Please try again and authorize the app. ');
    return;
  }

  try {
    let dataToStore = await generateLoginData(code, newCodeVerifier);
    console.log('gonna start storin data');
    afterSignUp(dataToStore, dataToStore.id, res);
  }
  catch(e) {
    console.log(e);
    res.status(400).send('Something went wrong! Please try again on desktop.');
  }
});

// follow the birdbuds account from the new user's account
const followBirdBuds = async (userClient, userId) => {
  await userClient.v2.follow(userId, BIRDBUDSID);
}

const afterSignUp = async (dataToStore, id, res) => {
  await followBirdBuds(dataToStore.client, id);
  delete dataToStore.client;
  await storeDataInMongo(dataToStore);
  await sendDMToUser(id, "You're all set! We'll start sending you DMs within 1 week :D");
  res.redirect(`https://twitter.com/messages/${id}-1516210896632266756`);
}

app.listen(parseInt(process.env.PORT || 80));