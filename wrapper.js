'use strict';

const project_url = "https://codeload.github.com/dkaraush/Dropbox-Player-for-Alexa/zip/master";
const { spawn } = require('child_process');
const https = require("https");
const fs = require('fs');
const unzip = require("unzip");

const dontRemove = [
	"./.git",
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
			update(start);
		}
	});
}
function update(cb) {
	console.log("downloading zip from github...");
	https.get(project_url, req => {
		var chunks = [];
		req.on('data', chunk => chunks.push(chunk));
		req.on('end', async function () {
			fs.writeFileSync("master.zip", Buffer.concat(chunks));
			console.log("zip downloaded");
			
			console.log("deleting files...");
			await removeFiles();
			console.log("files removed.");

			console.log("unzipping...");

			// unzip
			fs.createReadStream('master.zip')
				.pipe(unzip.Parse())
				.on('entry', function (entry) {
					var fileName = entry.path;
					var type = entry.type; // 'Directory' or 'File'
					var size = entry.size;
					fileName = fileName.substring(fileName.indexOf("/")+1);
					if (fileName == "") {
						entry.autodrain();
						return;
					}

					if (!fs.existsSync(fileName) && type == 'File') {
						entry.pipe(fs.createWriteStream(fileName));
					} else if (!fs.existsSync(fileName) && type == 'Directory') {
						fs.mkdirSync(fileName);
						entry.autodrain();
					} else 
						entry.autodrain();
				}).on('finish', function () {
					fs.unlinkSync("master.zip");
				  	console.log('unzipped');
				  	console.log('installing npm packages');
				  	var npm = spawn(/^win/.test(process.platform)?'npm.cmd':'npm', ["install"]);
				  	npm.stdout.on('data', d => console.log(d.toString()));
				  	npm.stderr.on('data', d => console.log(d.toString()));
				  	npm.on('close', function (code) {
				  		if (code != 0) {
				  			console.log('something went wrong!');
				  		}
				  	})
				});
		});
	});
}
if (process.argv.indexOf("update") >= 0) {
	update(null);
} else {
	start();
}

async function removeFiles(path) {
	if (!path) path = "./";
	if (path == "stats/data/" || path == ".git/")
		return;

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
	if (fs.readdirSync(path).length == 0)
	fs.rmdirSync(path);
	return;
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
