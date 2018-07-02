'use strict';

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
		return res.speak("Goodbye!")
				.getResponse();
	}
},
{
	name: "SearchIntent",
	_handle: async function(handlerInput, user, slots, res) {
		var query = slots.query.value;
		var files = await dropbox_search(user.accessToken, query);

		if (files.length == 0) {
			return res.speak("There is no music files in your dropbox with \"" + query + "\" name. Try again")
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
			return res.speak(`There ${(files.length==1?"is":"are")} ${files.length} file${files.length==1?"":"s"}. Play ${files.length==1?"it":"them"}?`)
						.reprompt(`Play ${files.length==1?"it":"them"}?`)
						.getResponse();
		}
	}
},
{
	name: "AcceptIntent",
	_handle: async function (handlerInput, user, slots, res) {
		var attributes = handlerInput.attributesManager.getSessionAttributes();
		var from = attributes.from;
		var data = playingData[user.userId];

		if (from == "SearchIntent" || from == "PlayAllIntent" || from == "AddIntent") {
			var files = data.files;
			data.token = randomString(16);
			data.playingIndex = 0;
			data.offset = 0;
			var link = await dropbox_download_link(user.accessToken, files[data.playingIndex]);
			data.links[data.playingIndex] = link;
			(function(user) {
				var data = playingData[user.userId];
				data.links.forEach(function (x, i) {
					dropbox_download_link(user.accessToken, data.files[i]).then(link => data.links[i]=link);
				});
			})(user);
			return res.addAudioPlayerPlayDirective('REPLACE_ALL', link, data.token, 0)
					.getResponse();
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
			playingData[user.userId] = {files: Array.from(files, o => o.metadata.path_display.substring(1)), links: new Array(files.length), loop: false};
			handlerInput.attributesManager.setSessionAttributes({from: "PlayAllIntent"});
			return res.speak(`There ${(files.length==1?"is":"are")} ${files.length} file${files.length==1?"":"s"}. Play ${files.length==1?"it":"them"}?`)
						.reprompt(`Play ${files.length==1?"it":"them"}?`)
						.getResponse();
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
	_handle: async function(handlerInput, user, slots, res) {
		playingData[user.userId].offset = handlerInput.requestEnvelope.request.offsetInMilliseconds;
		return res.speak("Paused.").addAudioPlayerStopDirective().getResponse();
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
	_handle(handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		data.token = randomString(16);
		return res.speak("Resumed.")
					.addAudioPlayerPlayDirective('REPLACE_ALL', data.links[data.playingIndex], data.token, data.offset)
					.getResponse();
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
		if (!data.loop && data.files.length <= data.playingIndex+1) {
			return res.getResponse();
		}

		if (data.files.length <= data.playingIndex+1) 
			data.playingIndex = 0;
		else data.playingIndex++;

		if (data.shuffle)
			data.playingIndex = Math.round(Math.random() * (data.files.length - 1));

		if (!data.links[data.playingIndex]) {
			data.links[data.playingIndex] = await dropbox_download_link(user.accessToken, data.files[data.playingIndex]);
		}

		return res.addAudioPlayerPlayDirective("ENQUEUE", data.links[data.playingIndex], data.token, 0, data.token).getResponse();
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
	_handle: async function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		data.playingIndex++;
		if (data.playingIndex >= data.files.length && !data.loop)
			return res.speak("Playlist ended").addAudioPlayerStopDirective().getResponse();
		else if (data.playingIndex >= data.files.length && data.loop) {
			data.playingIndex = 0;
		}
		if (!data.links[data.playingIndex])
			data.links[data.playingIndex] = await dropbox_download_link(user.accessToken, data.files[data.playingIndex]);
		return res.addAudioPlayerPlayDirective("REPLACE_ALL", data.links[data.playingIndex], data.token, 0).getResponse();
	}
},
{
	name: "AMAZON.PreviousIntent",
	_handle: async function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		data.playingIndex--;
		if (data.playingIndex < 0) {
			if (!data.loop)
				return res.speak("It is first file").getResponse();
			else 
				data.playingIndex = data.files.length - 1;
		}

		if (!data.links[data.playingIndex])
			data.links[data.playingIndex] = await dropbox_download_link(user.accessToken, data.files[data.playingIndex]);

		data.token = randomString(16);
		return res.addAudioPlayerPlayDirective("REPLACE_ALL", data.links[data.playingIndex], data.token, 0);
	}
},
{
	name: "AMAZON.LoopOnIntent",
	_handle: function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		data.loop = true;
		return res.speak("Loop on.").getResponse();
	}
},
{
	name: "AMAZON.LoopOffIntent",
	_handle: function (handlerInput, user, slots, res) {
		var data = playingData[user.userId];
		data.loop = false;
		return res.speak("Loop off.").getResponse();
	}
},
{
	name: "AddIntent",
	_handle: async function (handlerInput, user, slots, res) {
		var query = slots.query.value;
		var files = await dropbox_search(user.accessToken, query);
		files = Array.from(files, o => o.metadata.path_display.substring(1));

		if (playingIndex[user.userId]) {
			var wasLength = files.length;
			var data = playingIndex[user.userId];
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
				playingData[user.userId] = {files: files, playingIndex: 0, links: new Array(files.length), offset: 0};
				handlerInput.attributesManager.setSessionAttributes({from: "AddIntent"});
				return res.speak(`There ${files.length>1?"are":"is"} ${files.length} file${files.length>1?"s":""}. Play ${files.length>1?"them":"it"}?`)
						  .reprompt(`Play ${files.length>1?"them":"it"}?`)
						  .getResponse();
			} else {
				data.files = data.files.concat(files);
				data.links = data.links.concat(new Array(files.length));
				data.links.forEach((l, i) => {
					if (typeof l === "undefined") {
						dropbox_download_link(user.accessToken, data.files[i]).then(link => data.links[i] = link);
					}
				})
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
	var parsedName = handler.name.match(/AudioPlayer\.|[A-Z][a-z.]+|AMAZON\./g);
	if (parsedName == null)
		return;
	if (parsedName[parsedName.length-1] == "Handler")
		parsedName.splice(parsedName.length - 1, 1);

	if (parsedName[parsedName.length-1] == "Request" || parsedName[0] == "AudioPlayer.") {
		var requestName = handler.name;
		handler.canHandle = (handlerInput) => handlerInput.requestEnvelope.request.type == requestName;
	} else if (parsedName[parsedName.length - 1] == "Intent") {
		var intentName = parsedName.slice().join("");
		handler.canHandle = function (handlerInput) {
			return handlerInput.requestEnvelope.request.type == "IntentRequest" &&
					 handlerInput.requestEnvelope.request.intent.name == intentName;
		}
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
	/*
	var userId = handlerInput.requestEnvelope.session.user.userId;
	var link = replaceParameters(dropbox_oauth_url, {app_key: dropbox_app_key, redirect_uri: serverURL, user_id: userId});
	var redirectLink = "/" + randomString(7);
	redirects[redirectLink] = {created: Date.now(), duration: 1000*60*60*6, to: link, userid: userId};
	var smallQrCode = replaceParameters(qrcode_api_url, {data: serverURL + redirectLink, size: "480x480"});
	var largeQrCode = replaceParameters(qrcode_api_url, {data: serverURL + redirectLink, size: "800x800"});
	var fullRedirectLink = serverURL + redirectLink;
	return response.withStandardCard("Dropbox Player", "Connect your Dropbox. Link: " + fullRedirectLink, smallQrCode, largeQrCode);
	*/
	return response.withLinkAccountCard();
}

function makeList(files) {
	return {
				"header": {
					"namespace": "TemplateRuntime",
					"name": "RenderTemplate",
					"messageId": "message_id",
					"dialogRequestId": "dialog_request_id"
				},
				"payload": {
					"token": "token",
					"type": "ListTemplate1",
					"title": {
						"mainTitle": "Dropbox Files",
						"subTitle": "Music files in your Dropbox storage"
					},
					//"skillIcon": {{IMAGE_STRUCTURE}},
							"listItems": Array.from(files, (file, i) => {return {leftTextField: (i+1)+".", rightTextField: file}})
				}
			}
}