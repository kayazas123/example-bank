const express = require('express')
const router = express.Router()
const request = require('request')
// use .env file
const dotenv = require('dotenv');
dotenv.config();
// random name generator
const random_name = require('node-random-name');
// redis connection
const redis = require('redis');
// redisscan
const redisScan = require('redisscan');
// app id self service manager
const SelfServiceManager = require("ibmcloud-appid").SelfServiceManager;
let selfServiceManager = new SelfServiceManager({
	iamApiKey: process.env.APP_ID_IAM_APIKEY,
	managementUrl: process.env.APP_ID_MANAGEMENT_URL
});
// app id client credentials
const APP_ID_CLIENT_ID = process.env.APP_ID_CLIENT_ID
const APP_ID_CLIENT_SECRET = process.env.APP_ID_CLIENT_SECRET
const APP_ID_TOKEN_URL = process.env.APP_ID_TOKEN_URL


let redisClientUsers = redis.createClient(process.env.REDIS_URL_TEMP, {
	tls: {
	ca: process.env.REDIS_CA_TEMP }
})

router.get('/random_user', function (req, res) {
	res.send(random_name())
})

router.post('/login', function (req, res) {
  getAppIdToken(req.body.username, req.body.password, (err, response, body) => {
    if (err) {
      console.log(err)
      console.log(response)
      console.log(body)
      res.send(err)
    } else {
      let jsonBody = JSON.parse(body)
      let cookieOptions = {
        maxAge: jsonBody.expires_in * 1000
      }
      res.cookie('access_token', jsonBody.access_token, cookieOptions)
      res.cookie('id_token', jsonBody.id_token, cookieOptions)
      res.send(body)
    }
  })
})

router.post('/create_account', function (req, res) {
	let reqeustBody = req.body
	let userData = {
		displayName: reqeustBody.firstName + " " + reqeustBody.lastName,
		userName: reqeustBody.firstName + reqeustBody.lastName,
		emails: [
			{
				value: reqeustBody.email,
				type: "home"
			}
		],
		password: reqeustBody.password,
		name: {
			familyName: reqeustBody.lastName,
			givenName: reqeustBody.firstName
		}
	}

	selfServiceManager.signUp(userData, "en").then(function (user) {
		console.log('user created successfully');
		return createUserPass(user, reqeustBody.firstName + reqeustBody.lastName, reqeustBody.password)
	}).then(function (response) {
		res.send({user: response.user, status: "user created successfully", responseFromRedis: response.res})
	}).catch(function (err) {
		console.log(err);
		if (err.statusCode) {
			res.status(err.statusCode).send(err)
		} else {
			res.status('404').send(err)
		}
	});
})

router.get("/get_all_users", function(req, res) {
	let users = []
	redisScan({
		redis: redisClientUsers,
		keys_only: true,
		each_callback: function (type, key, subkey, length, value, cb) {
				users.push(key);
				cb();
		},
		done_callback: function (err) {
			if (err) {
				res.status('404').send(err)
			} else {
				res.send(users)
			}
		}
	});
});

function createUserPass(user, username, password) {
	return new Promise((resolve, reject) => {
		redisClientUsers.set(username, password, function(err, res) {
			if (err != null) {
				reject(err)
			} else {
				resolve({user, res})
			}
		})
	})
}

function getAppIdToken(username, password, callback) {
  let options = {
    url: APP_ID_TOKEN_URL + "/token",
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + new Buffer(APP_ID_CLIENT_ID + ":" + APP_ID_CLIENT_SECRET).toString('base64'),
      'Content-Type' : 'application/x-www-form-urlencoded'
    },
    form: {
      username,
      password,
      grant_type: 'password'
    }
  }

  request(options, function (err, response, body) {
    callback(err, response, body)
  })
}

module.exports = router
