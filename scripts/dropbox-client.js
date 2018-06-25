'use strict';

const dropboxV2Api = require('dropbox-v2-api');
const fs = require("fs");
const https = require('https');

global.dropbox_search = async function (accessToken, query) {
	return new Promise((resolve, reject) => {
		dropboxV2Api.authenticate({token: accessToken})({
			resource: 'files/search',
			parameters: {
				path: "",
				query: query,
				start: 0,
				max_results: 50,
				mode: "filename_and_content"
			}
		}, (err, result, response) => {
			if (err) {
				console.log("dropbox-client.js dropbox_search error:")
				console.log(err);
				reject(err);
			}
			resolve(result.matches.filter(file => (["wav","mp3"]).indexOf(file.metadata.path_lower.substring(file.metadata.path_lower.lastIndexOf(".")+1)) >= 0));
		});
	});
}

global.dropbox_download_link = async function (accessToken, path) {
	return new Promise((resolve, reject) => {
		dropboxV2Api.authenticate({token: accessToken})({
			resource: 'files/get_temporary_link',
			parameters: {
				path: path
			}
		}, (err, result, response) => {
			if (err) {
				console.dir(err);
				reject(err);
			} else {
				console.log(path.green + " => " + result.link.cyan);
				resolve(result.link);
			}
		})
	});

}

function getRedirectingLink(url, callback) {
	https.get(url, (res) => {
		callback(res.statusCode == 302 ? res.headers.location.toString() : url);
	})
}