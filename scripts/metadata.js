var id3 = require('node-id3');
var http = require('http');
var fs = require('fs');

const lastfm_url = "http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key={APIKEY}&artist={ARTIST}&track={TRACK}&format=json";

var alreadyLoaded = {};
module.exports = function (apikey) {
	return {
		check: function (identificator) {
			if (alreadyLoaded[identificator]) {
				return alreadyLoaded[identificator];
			}
			return null;
		},
		load: function (identificator, filename, buff) {
			return new Promise((resolve, reject) => {
				if (alreadyLoaded[identificator]) {
					resolve(alreadyLoaded[identificator]);
					return;
				}
				var tags = id3.read(buff) || {};
				if (!tags.title && !tags.artist) {
					filename = filename.replace(/_|\(.+\)/g," ");
					var match = filename.split(/ - | — |-|—/g);
					if (match.length == 2 || match.length == 2) {
						tags.artist = match[0];
						tags.title = match[1];
					}
				}
				
				if (tags.image && tags.image.imageBuffer) {
					if (!fs.existsSync("albums/"))
						fs.mkdirSync("albums/");
					var id = "albums/"+randomString(16)+".jpg";
					fs.writeFileSync(id, tags.image.imageBuffer);
					tags.imageURL = serverURL + "/" + id;
					alreadyLoaded[identificator] = tags;
					resolve(tags);
				} else if (tags.artist && tags.title && apikey) {
					var url = replaceParameters(lastfm_url, {apikey: encodeURIComponent(apikey), 
															 artist: encodeURIComponent(tags.artist), 
															 track: encodeURIComponent(tags.title)});
					console.log(url);
					http.get(url, req => {
						var chunks = [];
						req.on('data', chunk => chunks.push(chunk));
						req.on('end', () => {
							var resp = JSON.parse(chunks.join(''));
							if (resp.error && !resp.track) {
								alreadyLoaded[identificator] = tags;
								resolve(tags);
							} else if (resp.track && resp.track.album && resp.track.album.image) {
								var images = resp.track.album.image.filter(i => i["#text"].length>0);
								if (images.length == 0) {
									alreadyLoaded[identificator] = tags;
									resolve(tags);
									return;
								}

								images.sort((a, b) => {
									var ai = "small,medium,large,extralarge,mega".split(",").indexOf(a.size);
									var bi = "small,medium,large,extralarge,mega".split(",").indexOf(b.size);
									return ai < bi ? 1 : (ai > bi ? -1 : 0);
								});
								tags.imageURL = images[0]["#text"];
								alreadyLoaded[identificator] = tags;
								resolve(tags);
							} else {
								tags.imageURL = serverURL + "/assets/album.png";
								alreadyLoaded[identificator] = tags;
								resolve(tags);
							}
						})
					})
				} else {
					tags.imageURL = serverURL + "/assets/album.png";
					alreadyLoaded[identificator] = tags;
					resolve(tags);
				}
			});
		}
	}
}