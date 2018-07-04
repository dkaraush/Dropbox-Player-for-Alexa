'use strict';

const project_url = "https://codeload.github.com/dkaraush/Dropbox-Player-for-Alexa/zip/master";
const { spawn } = require('child_process');
const https = require("https");
const fs = require('fs');
const path = require('path');
const unzip = require("unzip");

const dontRemove = [
	"./wrapper.js",
	"./master.zip",
	"./config.json",
	"./stats.json",
	"./playing-data.json",
	"./stats/data"
]

function start () {
	var index = spawn("node", ["index.js"])
	index.stdout.on('data', (data) => {
		console.log(data.toString());
	});
	index.stderr.on('data', (data) => {
		console.log(data.toString());
	});
	index.on('close', (code) => {
		console.log("exited on " + code);
		if (code == 15) { // restarting
			console.log('restarting...');
			start();
		} else if (code == 17) { // downloading from github*/
			console.log("updating...")
			https.get(project_url, req => {
				var chunks = [];
				req.on('data', chunk => chunks.push(chunk));
				req.on('end', function () {
					fs.writeFileSync("master.zip", Buffer.concat(chunks));
					console.log("zip downloaded");
					
					removeFiles().then(() => {

						// unzip
						fs.createReadStream('master.zip').pipe(unzip.Parse())
							.on('entry', function (entry) {
								var fileName = entry.path;
								var type = entry.type; // 'Directory' or 'File'
								var size = entry.size;
								console.log(entry);
								fileName = "."+fileName.substring(fileName.indexOf('/'));
								if (fileName != "./" && !fs.existsSync(fileName))
									entry.pipe(fs.createWriteStream(fileName));
							});
					});

				});
			});
		}
	});
}
start();

function removeFiles(path) {
	if (!path) path = "./";
	if (path == "stats/data/")
		return;
	return new Promise(async (resolve, reject) => {
		var files = fs.readdirSync(path);
		for (var i = 0; i < files.length; ++i) {
			if (dontRemove.indexOf(path + files[i]) == -1) {
				if (fs.lstatSync(path + files[i]).isDirectory()) {
					await removeFiles(path + files[i] + "/");
				} else {
					fs.unlinkSync(path + files[i]);
				}
			}
		}
		resolve();
	})
}

function exitHandler(options, err) {
	if (typeof index !== "undefined") {
		index.stdin.pause();
		index.kill();
	}
	if (err instanceof Error) {
		throw err;
	}
}

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
