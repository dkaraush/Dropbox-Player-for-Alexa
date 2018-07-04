var id3 = require('node-id3');
var http = require('http');
var fs = require('fs');

const lastfm_url = "http://ws.audioscrobbler.com/2.0?method=album.getinfo&api_key={API_KEY}&artist={ARTIST}&album={ALBUM}&format=json";

var alreadyLoaded = {};
module.exports = function (apikey) {
	return {
		check: function (id) {
			if (alreadyLoaded[id])
				return alreadyLoaded[id];
			return null;
		},
		load: function (id, buff) {
			return new Promise((resolve, reject) => {
				console.log("metadata.js load");
				if (alreadyLoaded[id]) {
					resolve(alreadyLoaded[id]);
					return;
				}
				var tags = id3.read(buff);
				if (tags.image && tags.image.imageBuffer) {
					console.log('already have an image');
					if (!fs.existsSync("albums/"))
						fs.mkdirSync("albums/");
					var id = "albums/"+randomString(16)+".jpg";
					fs.writeFileSync(id, tags.image.imageBuffer);
					tags.imageURL = serverURL + "/" + id;
					alreadyLoaded[id] = tags;
					resolve(tags);
				} else if (tags.artist && tags.album && apikey) {
					console.log('i will try to download it from last fm');
					http.get(replaceParameters(lastfm_url, {api_key: apikey, artist: tags.artist, album: tags.album}), req => {
						var chunks = [];
						req.on('data', chunk => chunks.push(chunk));
						req.on('end', () => {
							var res = JSON.parse(chunks.join(''));
							if (res.error && !res.album) {
								alreadyLoaded[id] = tags;
								resolve(tags);
							} else {
								var images = res.album.image.filter(i => i["#text"].length>0);
								if (images.length == 0) {
									alreadyLoaded[id] = tags;
									resolve(tags);
									return;
								}

								images.sort((a, b) => {
									var ai = "small,medium,large,extralarge,mega".split(",").indexOf(a.size);
									var bi = "small,medium,large,extralarge,mega".split(",").indexOf(b.size);
									return ai < bi ? 1 : (ai > bi ? -1 : 0);
								});
								tags.imageURL = images[0]["#text"];
								alreadyLoaded[id] = tags;
								resolve(tags);
							}
						})
					})
				} else {
					console.log('it will be standard');
					tags.imageURL = serverURL + "/assets/album.png";
					alreadyLoaded[id] = tags;
					resolve(tags);
				}
			});
		}
	}
}