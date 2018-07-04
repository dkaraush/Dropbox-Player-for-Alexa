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
		load: function (identificator, buff) {
			console.log("1. " + identificator)
			return new Promise((resolve, reject) => {
			console.log("2. " + identificator)
				if (alreadyLoaded[identificator]) {
					resolve(alreadyLoaded[identificator]);
					return;
				}
				var tags = id3.read(buff);
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

					http.get(url, req => {
						var chunks = [];
						req.on('data', chunk => chunks.push(chunk));
						req.on('end', () => {
							var res = JSON.parse(chunks.join(''));
							if (res.error && !res.album) {
								alreadyLoaded[identificator] = tags;
								resolve(tags);
							} else if (res.album) {
								var images = res.album.image.filter(i => i["#text"].length>0);
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