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
			resolve(result.matches.filter(file => (["wav","mp3","aac","ogg","ts","tsv","tsa","m4a"]).indexOf(file.metadata.path_lower.substring(file.metadata.path_lower.lastIndexOf(".")+1)) >= 0));
		});
	});
}

global.dropbox_all = async function (accessToken) {
	return new Promise((resolve, reject) => {
		dropboxV2Api.authenticate({token: accessToken})({
			resource: 'files/list_folder',
			parameters: {
				path: "",
				recursive: true,
				include_media_info: false,
				include_deleted: false,
				include_has_explicit_shared_members: false,
				include_mounted_folders: false
			}
		}, (err, result, response) => {
			if (err) {
				console.log("dropbox-client.js dropbox_all error:")
				console.log(err);
				reject(err);
			}
			console.log(result.entries)
			resolve(result.entries.filter(file => (file['.tag']=='file'&&["wav","mp3","aac","ogg","ts","tsv","tsa","m4a"]).indexOf(file.path_lower.substring(file.path_lower.lastIndexOf(".")+1)) >= 0));
		});
	});
}

global.dropbox_download_link = async function (accessToken, path) {
	if (path[0] != "/") path = "/" + path;
	return new Promise((resolve, reject) => {
		dropboxV2Api.authenticate({token: accessToken})({
			resource: 'files/get_temporary_link',
			parameters: {
				path: path
			}
		}, (err, result, response) => {
			if (err) {
				reject(err);
			} else {
				resolve(result.link);
			}
		})
	});
}