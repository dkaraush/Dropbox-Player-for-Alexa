'use strict';

// common libraries
var fs = require("fs");
var ngrok = require("ngrok");
var Alexa = require("ask-sdk");
var http = require("http");
require("colors");

// own files
require("./utils.js");
var lambda = require("./skill.js");
var connected_page = fs.readFileSync("connected.html");

global.tokens = loadJSONFile("tokens.json", {}, false);
var config = loadJSONFile("config.json", {dropbox_app_key: "<your app key>", http_port: 8032, server_url: null}, true);

global.qrcode_api_url = "https://api.qrserver.com/v1/create-qr-code/?size={SIZE}&data={DATA}";
global.dropbox_oauth_url = "https://www.dropbox.com/1/oauth2/authorize?client_id={APP_KEY}&response_type=code&redirect_uri={REDIRECT_URI}&state={USER_ID}";
global.dropbox_app_key = config.dropbox_app_key;

global.redirects = {};
global.serverURL = null;
const http_port = config.http_port;

async function start() {
	if (!config.server_url) {
		serverURL = await ngrok.connect(http_port);
		console.log("ngrok started on " + serverURL.cyan.bold);
	} else {
		serverURL = config.server_url;
		if (serverURL[serverURL.length-1] == "/")
			serverURL=serverURL.substring(0, serverURL.length-1);
	}

	console.log("Instructions:".white.bold);
	console.log(" 1.".bold + " Put this url (" + (serverURL).cyan.bold + ") as an redirect uri to your OAuth2 dropbox app.");
	console.log(" 2.".bold + " Put this url (" + (serverURL + "/alexa/").cyan.bold + ") as an endpoint uri to your Amazon Skill. Select second item in the list about certifications.");

	var skill;
	var http_server = http.createServer(function (req, res) {
		var url = req.url;
		if (typeof redirects[url] !== "undefined") {
			if ((Date.now() - redirects[url].created) > redirects[url].duration) {
				res.statusCode = 200;
				res.setHeader("Content-Type", "text/html");
				res.end("<html><body><h2>Your redirect url is timed out.</h2></body></html>");
				return;
			}
			res.statusCode = 302;
			res.setHeader("Location", redirects[url].to);
			res.end();
			return;
		} else if (url == "/alexa/") {
			var chunks = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', function () {
				var body = JSON.parse(chunks.join(""));
				if (!skill) {
				  skill = Alexa.SkillBuilders.custom()
					.addRequestHandlers(...lambda.requestHandlers)
					.addErrorHandlers(lambda.errorHandler)
					.create();
				}

				skill.invoke(body)
				  .then(function(responseBody) {
					res.end(JSON.stringify(responseBody,"","\t"));
				  })
				  .catch(function(error) {
					console.log(error);
					res.statusCode = 500;
					res.end('{error: "error"}');
				  });
			});
		} else {
			if (url.indexOf("?")<=0) {
				res.statusCode = 404;
				res.end();
				return;
			}
			var raw_query = url.substring(url.indexOf("?")+1);
			var query = parseQuery(raw_query);

			if (!query.code && !query.state) {
				res.statusCode = 400;
				res.end();
				return;
			}

			global.tokens[query.state] = query.code;
			saveJSONFile("tokens.json", global.tokens);
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/html");
			res.end(connected_page);
		}
	});

	http_server.listen(http_port, function () {
		console.log("HTTP server started on :" + http_port);
	});
}

start();

