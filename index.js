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
let { sendDMToUser } = require('./twitter.js')
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
app.use(session({  secret: process.env.EXPRESS_SESSION_SECRET }));
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

app.get('/sessions/connect', function(req, res){
  consumer().getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret, results){ //callback with request token
    if (error) {
      res.send("Error getting OAuth request token : " + sys.inspect(error), 500);
    } else { 
      console.log("results>>"+sys.inspect(results));
 
      req.session.oauthRequestToken = oauthToken;
      req.session.oauthRequestTokenSecret = oauthTokenSecret;
      res.redirect("https://api.twitter.com/oauth/authorize?oauth_token="+req.session.oauthRequestToken);    
    }
  });
});


app.get('/sessions/callback', async function(req, res){
  consumer().getOAuthAccessToken(
    req.session.oauthRequestToken, 
    req.session.oauthRequestTokenSecret, 
    req.query.oauth_verifier, 
    async function(error, oauthAccessToken, oauthAccessTokenSecret, results) { //callback when access_token is ready
    if (error) {
      res.send("Error getting OAuth access token : " + sys.inspect(error), 500);
    } else {
      req.session.oauthAccessToken = oauthAccessToken;
      req.session.oauthAccessTokenSecret = oauthAccessTokenSecret;
      consumer().get("https://api.twitter.com/1.1/account/verify_credentials.json", 
                      req.session.oauthAccessToken, 
                      req.session.oauthAccessTokenSecret, 
                      async function (error, data, response) {  //callback when the data is ready
        if (error) {
          res.send("Error getting twitter screen name : " + sys.inspect(error), 500);
        } else {
          data = JSON.parse(data);
          console.log(data);
          req.session.twitterScreenName = data["screen_name"];  
          req.session.twitterLocaltion = data["location"];  
          await storeDataInMongo(req.session);
          await sendDMToUser(data.id, "You're all set! We'll start sending you DMs within 1 week :D");
          res.redirect(`https://twitter.com/messages/${data.id}-1516210896632266756`);
        }  
      });  

      // store data somewhere

    }
  });
});

app.listen(parseInt(process.env.PORT || 80));