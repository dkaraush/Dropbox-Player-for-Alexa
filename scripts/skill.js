'use strict';

var https = require("https");
var metadata = require("./metadata.js")(config.lastfm_api_key);

exports.requestHandlers = [
{
	name: "LaunchRequest",
	_handle(handlerInput, user, slots, res) {
		return res.speak("Your dropbox account successfully connected. Tell me what to play.")
				 .reprompt()
				 .getResponse();	
	}
},
{
	name: "SessionEndedRequest",
	_handle(handlerInput, user, slots, res) {
		return res.speak("Session ended.").getResponse();
	}
},
{
	name: "SearchIntent",
	_handle: async function(handlerInput, user, slots, res) {
		var query = slots.query.value;
		var files = await dropbox_search(user.accessToken, query);

		if (files.length == 0) {
			return res.speak(`There is no music files in your dropbox with "${query}" name. Try again`)
					 .reprompt()
					 .getResponse();
		} else {
			var data = playingData[user.userId] || {};
			data.query = query;
			data.files = Array.from(files, o => o.metadata.path_display.substring(1));
			data.links = new Array(files.length);
			data.loop = data.defaultLoop || false;
			data.shuffle = data.defaultShuffle || false;
			playingData[user.userId] = data;
			handlerInput.attributesManager.setSessionAttributes({from: "SearchIntent"});
			var hasDisplay = typeof handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display !== "undefined";
			res = res.speak(`There ${(files.length==1?"is":"are")} ${files.length} file${files.length==1?"":"s"}${hasDisplay?" on display":""}. Play ${files.length==1?"it":"them"}?`)
					 .reprompt(`Play ${files.length==1?"it":"them"}?`);
			if (hasDisplay)
				res = res.addRenderTemplateDirective(makeList(files));
			return res.getResponse();
		}
	}
},
{
	name: "AcceptIntent",
	_handle: async function (handlerInput, user, slots, res) {
		var attributes = handlerInput.attributesManager.getSessionAttributes();
		var from = attributes.from;
		var data = playingData[user.userId] || {};

		if (from == "SearchIntent" || from == "PlayAllIntent" || from == "AddIntent") {
			handlerInput.attributesManager.setSessionAttributes({});
			var files = data.files;
			data.token = randomString(16);
			data.playingIndex = 0;
			data.offset = 0;
			var link = await dropbox_download_link(user.accessToken, files[data.playingIndex]);
			data.links[data.playingIndex] = link;
			playingData[user.userId] = data;
			(function(user) {
				var data = playingData[user.userId];
				data.links.forEach(function (x, i) {
					dropbox_download_link(user.accessToken, data.files[i]).then(link => data.links[i] = link);
				});
			})(user);
			return new Promise((resolve, reject) => {
				getMetadata(user.userId, files[data.playingIndex], link).then(tags => {
					res = CardMetadata(res, tags.artist + " - " + tags.title, tags.imageURL, tags.imageURL);
					resolve(res.speak(`Playing ${data.files.length} file${data.files.length>1?"s":""}.`)
							.addAudioPlayerPlayDirective('REPLACE_ALL', link, data.token, 0, null, AudioMetadata(tags.title, tags.artist, tags.imageURL))
							.getResponse());
				})
			})
		}
		
		return res.speak("Ehm... What yes?").getResponse();
 	}
},
{
	name: "PlayAllIntent",
	_handle: async function(handlerInput, user, slots, res) {
		var files = await dropbox_search(user.accessToken, ".mp3");

		if (files.length == 0) {
			return res.speak("There is no MP3 files in your dropbox.")
					 .getResponse();
		} else {
			var data = playingData[user.userId] || {};
			data.files = Array.from(files, o => o.metadata.path_display.substring(1));
			data.links = new Array(files.length)
			data.loop = data.defaultLoop || false;
			data.shuffle = data.defaultShuffle || false;
			playingData[user.userId] = data;
			handlerInput.attributesManager.setSessionAttributes({from: "PlayAllIntent"});
			var hasDisplay = typeof handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display !== "undefined";
			res = res.speak(`There ${files.length==1?"is":"are"} ${files.length} file${files.length==1?"":"s"}${hasDisplay?" on display":""}. Play ${files.length==1?"it":"them"}?`)
					 .reprompt(`Play ${files.length==1?"it":"them"}?`)
			if (hasDisplay)
				res = res.addRenderTemplateDirective(makeList(files));
			return res.getResponse();
		}
	}
},
{
	name: "RefuseIntent",
	_handle: function (handlerInput, user, slots, res) {
		return res.speak("Ok.").getResponse();
 	}
},
{
	name: "AMAZON.FallbackIntent",
	_handle(handlerInput, user, slots, res) {
		return res.speak("Sorry, I didn't understand.").getResponse();
	}
},
{
	name: "AMAZON.PauseIntent",
	alternatives: "PlaybackController.PauseCommandIssued",
	_handle: async function(handlerInput, user, slots, res) {
		playingData[user.userId].offset = handlerInput.requestEnvelope.request.offsetInMilliseconds;
		if (handlerInput.requestEnvelope.request.intent.name == "AMAZON.PauseIntent")
			res = res.speak("Paused.");
		return res.addAudioPlayerStopDirective().getResponse();
	}
},
{
	name: "AMAZON.StopIntent",
	_handle: async function(handlerInput, user, slots, res) {
		return res.addAudioPlayerStopDirective().getResponse();
	}
},
{
	name: "AMAZON.ResumeIntent",
	alternatives: "PlaybackController.PlayCommandIssued",
	_handle(handlerInput, user, slots, res) {
		var data = playingData[user.userId] || {};
		data.token = randomString(16);
		playingData[user.userId] = data;
		if (handlerInput.requestEnvelope.request.intent.name == "AMAZON.PauseIntent")
			res = res.speak("Resumed.");

		return new Promise((resolve, reject) => {
			getMetadata(user.userId, data.files[data.playingIndex], data.links[data.playingIndex]).then(tags => {
				res = CardMetadata(res, tags.artist + " - " + tags.title, tags.imageURL, tags.imageURL);
				resolve(res.addAudioPlayerPlayDirective('REPLACE_ALL', data.links[data.playingIndex], data.token, data.offset, null, AudioMetadata(tags.title, tags.artist, tags.imageURL))
					.getResponse());
			})
		});
	}
},
{
	name: "AudioPlayer.PlaybackStarted",
	_handle(handlerInput, user, slots, res) {
		return res.getResponse();
	}
},
{
	name: "AudioPlayer.PlaybackFinished",
	_handle: async function(handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		if (data && data.nextIndex) {
			data.offset = 0;
			data.playingIndex = data.nextIndex;
			delete data.nextIndex;
		}
		return res.getResponse();
	}
},
{
	name: "AudioPlayer.PlaybackStopped",
	_handle(handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		if (!data) return res.getResponse();
		data.offset = handlerInput.requestEnvelope.request.offsetInMilliseconds;
		return res.getResponse();
	}
},
{
	name: "AudioPlayer.PlaybackNearlyFinished",
	_handle: async function(handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		if (!data)
			return res.getResponse();
		data.nextIndex = data.playingIndex+1;
		if (!data.loop && data.files.length <= data.nextIndex+1)
			return res.getResponse();

		if (data.nextIndex >= data.files.length) 
			data.nextIndex = 0;

		if (data.shuffle)
			data.nextIndex = Math.round(Math.random() * (data.files.length - 1));

		if (!data.links[data.nextIndex])
			data.links[data.nextIndex] = await dropbox_download_link(user.accessToken, data.files[data.nextIndex]);
		return new Promise((resolve, reject) => {
			getMetadata(user.userId, data.files[data.nextIndex], data.links[data.nextIndex]).then(tags => {
				tags.title = tags.title || data.files[data.playingIndex];
				tags.artist = tags.artist || ("Dropbox Music Player ("+(data.playingIndex+1)+"/"+data.files.length+")");
				resolve(res.addAudioPlayerPlayDirective("ENQUEUE", data.links[data.nextIndex], data.token, 0, data.token, AudioMetadata(tags.title, tags.artist, tags.imageURL)).getResponse());
			})
		});
	}
},
{
	name: "AudioPlayer.ClearQueue",
	_handle(handlerInput, user, slots, res) {
		playingData[user.userId] = {};
		return res.addAudioPlayerClearQueueDirective().getResponse();
	}
},
{
	name: "AMAZON.HelpIntent",
	_handle: function (handlerInput, user, slots, res) {
		return res.speak("Tell me which files to play and I will search for them. For example: Alexa, tell dropbox player to search for Radiohead.").reprompt().getResponse();
 	}
},
{
	name: "AMAZON.CancelIntent",
	_handle: function (handlerInput, user, slots, res) {
		return res.speak("Cancelled.").getResponse();
	}
},
{
	name: "AMAZON.StopIntent",
	_handle: function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		for (var key in data)
			if (key != "defaultLoop" || key != "defaultShuffle")
				delete data[key];
		return res.speak("Stopped.").getResponse();
	}
},
{
	name: "AMAZON.NextIntent",
	alternatives: "PlaybackController.NextCommandIssued",
	_handle: async function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		if (!data) return res.getResponse();
		data.playingIndex++;
		if (data.playingIndex >= data.files.length && !data.loop) {
			if (handlerInput.requestEnvelope.request.intent.name == "AMAZON.NextIntent")
				res = res.speak("Playlist ended");
			return res.addAudioPlayerStopDirective().getResponse();
		}
		else if (data.playingIndex >= data.files.length && data.loop) {
			data.playingIndex = 0;
		}

		if (!data.links[data.playingIndex])
			data.links[data.playingIndex] = await dropbox_download_link(user.accessToken, data.files[data.playingIndex]);
		data.offset = 0;
		delete data.nextIndex;
		return new Promise((resolve, reject) => {
			getMetadata(user.userId, data.files[data.playingIndex], data.links[data.playingIndex]).then(tags => {
				tags.title = tags.title || data.files[data.playingIndex];
				tags.artist = tags.artist || ("Dropbox Music Player ("+(data.playingIndex+1)+"/"+data.files.length+")");
				res = CardMetadata(res, tags.artist + " - " + tags.title, tags.imageURL, tags.imageURL);
				resolve(res.addAudioPlayerPlayDirective("REPLACE_ALL", data.links[data.playingIndex], data.token, 0, null, AudioMetadata(tags.title, tags.artist, tags.imageURL)).getResponse());
			})
		});
	}
},
{
	name: "AMAZON.PreviousIntent",
	alternatives: "PlaybackController.PreviousCommandIssued",
	_handle: async function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		if (!data) return res.getResponse();
		data.playingIndex--;
		if (data.playingIndex < 0) {
			if (!data.loop) {
				if (handlerInput.requestEnvelope.request.intent.name == "AMAZON.NextIntent")
					res = res.speak("It is first file");
				return res.getResponse();
			} else 
				data.playingIndex = data.files.length - 1;
		}

		if (!data.links[data.playingIndex])
			data.links[data.playingIndex] = await dropbox_download_link(user.accessToken, data.files[data.playingIndex]);
		data.offset = 0;
		delete data.nextIndex;
		return new Promise((resolve, reject) => {
			getMetadata(user.userId, data.files[data.playingIndex], data.links[data.playingIndex]).then(tags => {
				tags.title = tags.title || data.files[data.playingIndex];
				tags.artist = tags.artist || ("Dropbox Music Player ("+(data.playingIndex+1)+"/"+data.files.length+")");
				res = CardMetadata(res, tags.artist + " - " + tags.title, tags.imageURL, tags.imageURL);
				resolve(res.addAudioPlayerPlayDirective("REPLACE_ALL", data.links[data.playingIndex], data.token, 0, null, AudioMetadata(tags.title, tags.artist, tags.imageURL)).getResponse());
			})
		});
	}
},
{
	name: "AMAZON.LoopOnIntent",
	_handle: function (handlerInput, user, slots, res) {
		var data = playingData[user.userId] || {};
		data.loop = true;
		playingData[user.userId] = data;
		return res.speak("Loop on.").getResponse();
	}
},
{
	name: "AMAZON.LoopOffIntent",
	_handle: function (handlerInput, user, slots, res) {
		var data = playingData[user.userId] || {};
		data.loop = false;
		playingData[user.userId] = data;
		return res.speak("Loop off.").getResponse();
	}
},
{
	name: "AddIntent",
	_handle: async function (handlerInput, user, slots, res) {
		var query = slots.query.value;
		var _files = await dropbox_search(user.accessToken, query);
		var files = Array.from(_files, o => o.metadata.path_display.substring(1));

		if (playingData[user.userId]) {
			var wasLength = files.length;
			var data = playingData[user.userId];
			for (var i = 0; i < files.length; ++i) {
				for (var j = 0; j < data.files.length; ++j) {
					if (files[i] == data.files[j]) {
						files.splice(i, 1);
						i--;
						break;
					}
				}
			}
			if (wasLength > 0 && files.length == 0)
				return res.speak("This files are already in playlist.").getResponse();
		}

		if (files.length == 0) {
			return res.speak("No files found. Try again").reprompt().getResponse();
		} else {
			var data = playingData[user.userId];
			if (!data) {
				data = {};
				data.files = files;
				data.playingIndex = 0
				data.links = new Array(files.length);
				data.offset = 0;
				data.loop = data.defaultLoop || false;
				data.shuffle = data.defaultShuffle || false;
				playingData[user.userId] = data;
				var hasDisplay = typeof handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display !== "undefined";
				handlerInput.attributesManager.setSessionAttributes({from: "AddIntent"});
				res = res.speak(`There ${files.length>1?"are":"is"} ${files.length} file${files.length>1?"s":""}. Play ${files.length>1?"them":"it"}?`)
						 .reprompt(`Play ${files.length>1?"them":"it"}?`);
				if (hasDisplay)
					res.addRenderTemplateDirective(makeList(_files));
				return res.getResponse();
			} else {
				data.files = data.files.concat(files);
				data.links = data.links.concat(new Array(files.length));
				data.links.forEach((l, i) => {
					if (typeof l === "undefined")
						dropbox_download_link(user.accessToken, data.files[i]).then(link => data.links[i] = link);
				});
				return res.speak(`Added. Playlist contains now ${data.files.length} file${data.files.length>1?"s":""}.`).getResponse();
			}
		}
	}
},
{
	name: "AMAZON.ShuffleOnIntent",
	_handle(handlerInput, user, slots, res) {
		playingData[user.userId].shuffle = true;
		return res.getResponse();
	}
},
{
	name: "AMAZON.ShuffleOffIntent",
	_handle(handlerInput, user, slots, res) {
		playingData[user.userId].shuffle = false;
		return res.getResponse();
	}
},
{
	name: "SetLoopDefaultIntent",
	_handle(handlerInput, user, slots, res) {
		var data = playingData[user.userId] || {};
		data.defaultLoop = slots.bool.value == "on";
		playingData[user.userId] = data;
		return res.speak(`Default loop set to ${data.defaultLoop?"on":"off"}.`).getResponse();
	}
},
{
	name: "SetShuffleDefaultIntent",
	_handle(handlerInput, user, slots, res) {
		var data = playingData[user.userId] || {};
		data.defaultShuffle = slots.bool.value == "on";
		playingData[user.userId] = data;
		return res.speak(`Default shuffle set to ${data.defaultShuffle?"on":"off"}.`).getResponse();
	}
}
];

exports.errorHandler = {
	canHandle() {
		return true;
	},
	handle(handlerInput, error) {
		console.log(`Error handled: ${error.message}`);
		throw error;

		return handlerInput.responseBuilder
			.speak('Sorry, I can\'t understand the command.')
			.reprompt('Sorry, I can\'t understand the command.')
			.getResponse();
	}
}

exports.requestHandlers.forEach(handler => {
	var allNames = [];
	allNames.push(handler.name);
	if (typeof handler.alternatives === "string")
		allNames.push(handler.alternatives);
	else if (Array.isArray(handler.alternatives))
		allNames = allNames.concat(handler.alternatives);
	var conditions = new Array(allNames.length);
	for (var i = 0; i < allNames.length; ++i) {
		var name = allNames[i];
		var parsedName = name.match(/AudioPlayer\.|PlaybackController\.|[A-Z][a-z.]+|AMAZON\./g);
		if (parsedName == null)
			return;
		if (parsedName[parsedName.length-1] == "Handler")
			parsedName.splice(parsedName.length - 1, 1);

		if (parsedName[parsedName.length-1] == "Request" || parsedName[0] == "AudioPlayer." || parsedName[0] == "PlaybackController.") {
			var requestName = name;
			conditions[i] = (handlerInput) => handlerInput.requestEnvelope.request.type == requestName;
		} else if (parsedName[parsedName.length - 1] == "Intent") {
			conditions[i] = function (handlerInput) {
				return handlerInput.requestEnvelope.request.type == "IntentRequest" &&
						 handlerInput.requestEnvelope.request.intent.name == name;
			}
		} else {
			console.log("Handler doesn't have its request: " + name);
		}
	}
	handler.canHandle = function (handlerInput) {
		for (var i = 0; i < conditions.length; ++i) {
			if (conditions[i](handlerInput))
				return true;
		}
		return false;
	}


	handler.handle = function (handlerInput) {
		var user = handlerInput.requestEnvelope.context.System.user;
		if (!user.accessToken) {
			return makeConnectingCard(handlerInput.responseBuilder, handlerInput)
					.speak("You have to link your Dropbox account first. Check your mobile phone.")
					.getResponse();
		}
		var slots = handlerInput.requestEnvelope.request.intent ? handlerInput.requestEnvelope.request.intent.slots : null;
		return handler._handle(handlerInput, user, slots, handlerInput.responseBuilder)
	}
});

function makeConnectingCard(response, handlerInput) {
	return response.withLinkAccountCard();
}

function makeList(files) {
	var r = 
	{
		type: 'ListTemplate1',
		token: 'Files',	
		title: "Dropbox files",
		listItems: Array.from(files, (file, i) => {
		var filename = file.metadata.path_display.substring(1); 
		return {
			token: "item_"+(i+1),
			image: {
				sources: [
					{
						url: serverURL+"/assets/icon.png",
						widthPixels: 200,
						heightPixels: 200
					}
				],
				contentDescription: "music"
			},
			textContent: {
				primaryText: {
					text: "<font size='6'>"+file.metadata.name+"</font>",
					type: "RichText"
				},
				secondaryText: {
					text: file.metadata.path_display,
					type: "PlainText"
				}
			}
		}})
	};
	return r;
}


function getMetadata(uid, path, link) {
	return new Promise((resolve, reject) => {
		var tags = metadata.check(uid+path);
		if (tags)
			resolve(tags);
		https.get(link, req => {
			var chunks = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				metadata.load(uid+path, Buffer.concat(chunks))
					.then(resolve);
			})
		});
	})
}
function CardMetadata(res, title, arturl) {
	return res.withStandardCard("Dropbox Player", "Now is playing: " + title, arturl, arturl);
}
function AudioMetadata(title, subtitle, arturl) {
	return {
		title: title,
		subtitle: subtitle,
		art: {
			contentDescription: "Dropbox Icon",
			sources: [
				{
				 	"url": arturl,
					"widthPixels": 1024,
					"heightPixels": 1024
				}
			]
		},
		backgroundImage: {
			contentDescription: "Dropbox Background",
			sources: [
				{
					"url": serverURL + "/assets/bg-blur.png",
					"widthPixels": 1024,
					"heightPixels": 640
				}
			]
		}
	}
}