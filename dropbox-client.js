'use strict';

const dropboxV2Api = require('dropbox-v2-api');
const fs = require("fs");
const https = require('https');

global.dropbox_oauth_url = "https://www.dropbox.com/1/oauth2/authorize?client_id={APP_KEY}&response_type=token&redirect_uri={REDIRECT_URI}&state={USER_ID}";

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
	var ext = path.substring(path.indexOf(".")+1);
	var filename = randomString(32)+"."+ext;
	return new Promise((resolve, reject) => {
		var password = randomString(64);
		dropboxV2Api.authenticate({token: accessToken})({
			resource: 'sharing/create_shared_link_with_settings',
			parameters: {
				path: path,
				settings: {
					requested_visibility: "public"/*,
					expires: (new Date(Date.now() + 3600000)).toISOString().replace(/\.\d+Z$/g,"Z") // + 1 hour*/
				}
			}
		}, (err, result, response) => {
			if (err && err.error_summary.indexOf("shared_link_already_exists")==0) {
				dropboxV2Api.authenticate({token: accessToken})({
					resource: 'sharing/list_shared_links',
					parameters: {
						path: path
					}
				}, (err, result, response) => {
					if (err) {
						console.log(err);
						//throw err;
						reject(err);
					}
					getRedirectingLink(result.links[0].url.replace(/dl=0$/g,"dl=1"), resolve);
				})
			} else if (err == null) {
				getRedirectingLink(result.url.replace(/dl=0$/g,"dl=1"), resolve);
			} else {
				//throw err;
				reject(err);
			}
		})
	});
}

function getRedirectingLink(url, callback) {
	https.get(url, (res) => {
		if (res.statusCode == 302) {
			callback(res.headers.location.toString());
		} else {
			callback(url);
		}
	})
}