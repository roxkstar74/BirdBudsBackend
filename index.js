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
let { sendDMToUser, generateAuthURL, generateLoginData } = require('./twitter.js')
const { MongoClient } = require("mongodb");
dotenv.config();

// Replace the uri string with your MongoDB deployment's connection string.
const uri =
  `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PW}@${process.env.MONGO_URL}?retryWrites=true&writeConcern=majority`;
const client = new MongoClient(uri);

// all environments
app.set('port', process.env.PORT || 80);
app.use(bodyParser());
app.use(cookieParser());
app.use(session({  saveUninitialized: true, resave: true, secret: process.env.EXPRESS_SESSION_SECRET, state: 'spaghet', codeVerifier: 'spaghetti2' }));
app.use(function(req, res, next){
    res.locals.user = req.session.user;
    next();
});
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
          await logins.insertOne(loginData);
          console.log('Login stored!');
        } finally {
          // Ensures that the client will close when you finish/error
          await client.close();
        }
      }
      return run().catch(console.dir);      
};

let codeVerifier;
let state;
app.get('/v2', function(req, res){
  res.status(200).send('BirdBuds v2 is up!');
});

app.get('/v2/login', function(req, res){
  let authURLBlob = generateAuthURL();
  codeVerifier = authURLBlob.codeVerifier;
  state = authURLBlob.state;
  console.log(authURLBlob.url);
  res.session = {};
  res.session.state = state;
  res.session.codeVerifier = codeVerifier;
  res.redirect(authURLBlob.url);
});

app.get('/v2/callback', async function(req, res) {
  console.log('CALLBACK HIT', req.url);  // Extract state and code from query string
  const { code } = req.query;
  const newState = req.query.state;
  // Get the saved codeVerifier from session
  const { codeVerifier: newCodeVerifier, state: sessionState } = req.session;
  console.log('newCodeVerifier', newCodeVerifier);
  console.log('sessionState', sessionState);
  console.log('codeVerifier', codeVerifier);
  console.log('state', state);

  if(state == newState) {
    console.log('state matches');
  }
  else {
    console.log('state does not match');
  }

  // if (!codeVerifier || !state || !sessionState || !code) {
  //   return res.status(400).send('You denied the app or your session expired!');
  // }
  // if (state !== sessionState) {
  //   return res.status(400).send('Stored tokens didnt match!');
  // }

  let dataToStore = await generateLoginData(code, codeVerifier);
  console.log('gonna start storin data');
  afterSignUp(dataToStore, dataToStore.id, res);
});

const afterSignUp = async (dataToStore, id, res) => {
  delete dataToStore.client;
  await storeDataInMongo(dataToStore);
  await sendDMToUser(id, "You're all set! We'll start sending you DMs within 1 week :D");
  res.redirect(`https://twitter.com/messages/${id}-1516210896632266756`);
}

app.listen(parseInt(process.env.PORT || 80));