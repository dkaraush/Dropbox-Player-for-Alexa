'use strict';

// common libraries
var fs = require("fs");
var ngrok = require("ngrok");
var Alexa = require("ask-sdk");
var http = require("http");
var https = require('https');
require("colors");

require("./scripts/utils.js");

global.config = 		loadJSONFile("config.json", {http_port: 8032, server_url: null, lastfm_api_key: null}, true);
global.playingData = 	loadJSONFile("playing-data.json", {}, false);
const http_port = 		config.http_port;
global.serverURL = 		config.server_url;

require("./scripts/dropbox-client.js");
var lambda = require("./scripts/skill.js");
var stats = require("./stats/index.js");

var states = {};
var skill;
var httpServer = null;

stats.url = config.stats_url || randomString(16);

const dropbox_auth = "https://www.dropbox.com/oauth2/authorize";
async function start() {
	if (!serverURL) {
		serverURL = await ngrok.connect(http_port);
		console.log("ngrok started on " + serverURL.cyan.bold);
	} else {
		if (serverURL[serverURL.length-1] == "/")
			serverURL=serverURL.substring(0, serverURL.length-1);
	}

	console.log("Instructions:".white.bold);
	console.log(" 1.".bold + ` Put this url (${(serverURL+"/alexa/").cyan.bold}) to Alexa skill's endpoint.`);
	console.log(" 2.".bold + ` Put this urls (${(serverURL+"/auth/").cyan.bold} & ${(serverURL+"/token/").cyan.bold}) in ${"\"Account Linking\"".yellow.bold} as an authorization URI.`);
	console.log(" 3.".bold + ` Put this url (${(serverURL+"/receive-auth/").cyan.bold}) in your Dropbox App as an redirect URL.`);
	console.log();
	console.log("You can view stats in "+(serverURL+"/"+stats.url).cyan.bold);

	httpServer = http.createServer(function (req, res) {
		var url = req.url;
		var raw_query = getRawQuery(req);
		var query = parseQuery(raw_query);
		if (query[""] == "")
			delete query[""];
		if (raw_query !== "" && req.method == "GET")
			url = url.substring(0, url.indexOf("?"));

		if (url == "/alexa/" && req.method == "POST") {
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

				var playingDataWas = Object.assign({}, playingData[body.context.System.user.userId]);
				skill.invoke(body)
				  .then(function(responseBody) {
					res.end(JSON.stringify(responseBody,"","\t"));
					stats.reportAlexa(JSON.stringify(body,null,"\t"), 
										  JSON.stringify(responseBody,null,"\t"), 
										  req.method+" "+req.url+" HTTP/1.1\n"+headersString(req.headers), 
										  res._header, playingDataWas, Object.assign({}, playingData[body.context.System.user.userId]));
				  })
				  .catch(function(error) {
					console.log(error);
					res.statusCode = 500;
					res.end('{error: "error"}');
				  });
			});
		} else if (url == "/auth/") {
			var newState = randomString(100);
			states[newState] = {value: query.state, redirect: query.redirect_uri};
			query.state = newState;
			query.redirect_uri = serverURL + "/receive-auth/";
			res.statusCode = 302;
			res.setHeader("Location", dropbox_auth + "?" + stringifyQuery(query));
			res.end();
		} else if (url == "/receive-auth/") {
			var state = states[query.state];
			if (typeof state === "undefined") {
				res.statusCode = 400;
				res.end("We lost your state. Sorry :C");
				return;
			}
			query.state = state.value;
			res.statusCode = 302;
			res.setHeader("Location", state.redirect + "?" + stringifyQuery(query));
			res.end();
		} else if (url == "/token/" && req.method == "POST") {
			// https://api.dropboxapi.com/oauth2/token
			
			var chunks = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				var body = parseQuery(chunks.join(''));
				body.redirect_uri = serverURL + "/receive-auth/";
				delete body.client_id;
				var raw_body = stringifyQuery(body);

				var headers = req.headers;

				headers.host = "api.dropboxapi.com";
				if (typeof headers["x-forwarded-for"] !== "undefined")
					headers["x-forwarded-for"] = "162.125.66.7";
				headers["Content-Length"] = raw_body.length;
				var req1 = https.request({
					hostname: "api.dropboxapi.com",
					path: "/oauth2/token",
					port: 443,
					headers: headers,
					method: "POST"
				}, (res1) => {
					for (var header in res1.headers)
						res.setHeader(upperCaseHeader(header), res1.headers[header]);
					res.statusCode = res1.statusCode;
					var giving = "";
					res1.on('data', chunk => {giving+=chunk; res.write(chunk)});
					res1.on('end', () => {
						res.end();
					});
				});
				req1.end(raw_body);
			});
		} else if (url.split("/")[1] == "assets" || url.split("/")[1] == "albums") {
			if (!fs.existsSync("."+url)) {
				res.statusCode = 404;
				res.end();
				return;
			} else if (req.headers["cache-control"] == "max-age=0") {
				res.statusCode = 304;
				res.end();
				return;
			}
			res.statusCode = 200;
			fs.createReadStream("."+url).pipe(res);
		} else if (url.split("/")[1] == stats.url) {
			stats.receive(req, res, url, query);
		} else {
			res.statusCode = 404;
			res.end();
		}
	});
	httpServer.listen(http_port, function () {
		console.log("HTTP server started on :" + http_port);
	});
}

start();

function exitHandler(options, err) {
	if (err instanceof Error) {
		stats.reportError(err);
    	console.log (err.toString().red);
    }
    if (options.exit) {
		console.log("Saving...");
		saveJSONFile("playing-data.json", playingData);
		stats.save();
		console.log("Saved.".green.bold);
		process.exit();
	}
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:false}));
process.on('unhandledRejection', (reason, p) => {
  exitHandler({}, reason);
});
