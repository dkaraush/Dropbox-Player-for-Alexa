'use strict';

// common libraries
var fs = require("fs");
var ngrok = require("ngrok");
var Alexa = require("ask-sdk");
var http = require("http");
require("colors");

// own files
require("./utils.js");
require("./dropbox-client.js");
var lambda = require("./skill.js");
var connected_page = fs.readFileSync("html/connected.html");
var connecting_page = fs.readFileSync("html/connecting.html");

global.CONFIG_FILE = "config.json";
global.TOKENS_FILE = "tokens.json";

var config = loadJSONFile(CONFIG_FILE, {dropbox_app_key: "<your app key>", dropbox_app_secret: "<your app secret>", http_port: 8032, server_url: null}, true);
global.tokens = loadJSONFile(TOKENS_FILE, {}, false);

global.qrcode_api_url = "https://api.qrserver.com/v1/create-qr-code/?size={SIZE}&data={DATA}";
global.dropbox_app_key = config.dropbox_app_key;
global.dropbox_app_secret = config.dropbox_app_secret;

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
				delete redirects[url];
				return;
			}
			res.statusCode = 302;
			res.setHeader("Set-Cookie", "userid=" + redirects[url].userid);
			res.setHeader("Location", redirects[url].to);
			res.end();
			return;
		} else if (url.split("/")[1] == "tracks") {
			fs.createReadStream("." + url).pipe(res);
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
		} else if (url.indexOf("?")>=0 && url.substring(0, url.indexOf("?")) == "/connected/") {
			var raw_query = url.substring(url.indexOf("?")+1);
			var query = parseQuery(raw_query);

			if (!query.code && !query.state) {
				res.statusCode = 400;
				res.end();
				return;
			}

			global.tokens[query.state] = query;
			saveJSONFile(TOKENS_FILE, global.tokens);
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/html");
			res.end(connected_page);
		} else {
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/html");
			res.end(connecting_page);
		}
	});

	http_server.listen(http_port, function () {
		console.log("HTTP server started on :" + http_port);
	});
}

start();

