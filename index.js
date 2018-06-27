'use strict';

// common libraries
var fs = require("fs");
var ngrok = require("ngrok");
var Alexa = require("ask-sdk");
var http = require("http");
var https = require('https');
require("colors");

// own files
require("./scripts/utils.js");
require("./scripts/dropbox-client.js");
var lambda = require("./scripts/skill.js");

var config = loadJSONFile("config.json", {http_port: 8032, server_url: null}, true);
global.playingData = loadJSONFile("playing-data.json", {}, false);
const http_port = config.http_port;
global.serverURL = config.server_url;

var states = {};

const dropbox_auth = "https://www.dropbox.com/oauth2/authorize";
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
	console.log(" 1.".bold + " Put this url (" + (serverURL+"/alexa/").cyan.bold + ") to Alexa skill's endpoint.");
	console.log(" 2.".bold + " Put this urls (" + (serverURL+"/auth/").cyan.bold + " & "+ (serverURL+"/token/").cyan.bold +") in "+"\"Account Linking\"".yellow.bold+" as an authorization URI.");
	console.log(" 3.".bold + " Put this url (" + (serverURL+"/receive-auth/").cyan.bold + ") in your Dropbox App as an redirect URL.");

	var skill;
	var http_server = http.createServer(function (req, res) {
		//if (!proxy.check(req, res)) {
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
			//https://api.dropboxapi.com/oauth2/token
			
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
		} else {
			res.statusCode = 404;
			res.end();
		}
		//}
	});

	http_server.listen(http_port, function () {
		console.log("HTTP server started on :" + http_port);
	});
}

start();

function exitHandler(options, err) {
	saveJSONFile("playing-data.json", playingData);
    if (options.exit) process.exit();
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));