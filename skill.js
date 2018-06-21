'use strict';

exports.requestHandlers = [
{
	name: "LaunchRequest",
	_handle(handlerInput, userid, slots, res) {
		return res.speak("Your dropbox account successfully connected. Tell me what to play.")
			   .reprompt()
			   .getResponse();	
	}
},
{
	name: "SessionEndedRequest",
	_handle(handlerInput, userid, slots, res) {
		return res.speak("Goodbye!")
				.getResponse();
	}
},
{
	name: "SearchIntent",
	_handle: async function(handlerInput, userid, slots, res) {
		var query = slots.query.value;
		var files = await dropbox_search(tokens[userid].access_token, query);

		if (files.length == 0) {
			return res.speak("There is no music files in your dropbox with \"" + query + "\" name. Try again")
					 .reprompt()
					 .getResponse();
		} else {
			handlerInput.attributesManager.setSessionAttributes({query: query, files: Array.from(files, o => o.metadata.path_display), playingIndex: 0, from: "SearchIntent"});
			return res.speak(`There ${(files.length==1?"is":"are")} ${files.length} file${files.length==1?"":"s"}. Play ${files.length==1?"it":"them"}?`)
					  .reprompt(`Play ${files.length==1?"it":"them"}?`)
					  .getResponse();
		}

		return res.speak("You said to me to play \""+query+"\"")
				.getResponse();
	}
},
{
	name: "AcceptIntent",
	_handle: async function (handlerInput, userid, slots, res) {
		var attributes = handlerInput.attributesManager.getSessionAttributes();
		var from = attributes.from;

		if (from == "SearchIntent") {
			var files = attributes.files;
			
			var link = await dropbox_download_link(tokens[userid].access_token, attributes.files[attributes.playingIndex]);
			handlerInput.attributesManager.setSessionAttributes({currentLink: link, files: files, playingIndex: 0, offset: 0});
			return res.speak("Playing \""+attributes.query+"\" file"+(files.length==1?"":"s")+"...")
					.addAudioPlayerPlayDirective('REPLACE_ALL', link, files[0], 0)
					.getResponse();
		}
		
		return res.speak("Ehm... What yes?").getResponse();
 	}
},
{
	name: "RefuseIntent",
	_handle: function (handlerInput, userid, slots, res) {
		return res.speak("Ok.").getResponse();
 	}
},
{
	name: "ForgetAccountIntent",
	_handle(handlerInput, userid, slots, res) {
		delete tokens[userid];
		saveJSONFile(TOKENS_FILE, tokens);

		return makeConnectingCard(res, handlerInput).speak("Your Dropbox account is forgotten. Check your mobile phone for new URL to connect another one.").getResponse();
	}
},
{
	name: "AMAZON.FallbackIntent",
	_handle(handlerInput, userid, slots, res) {
		return res.speak("Sorry, I didn't understand.").getResponse();
	}
},
{
	name: "AMAZON.PauseIntent",
	_handle: async function(handlerInput, userid, slots, res) {
		console.log("paused");
		console.dir(handlerInput.requestEnvelope);
		var attributes = handlerInput.attributesManager.getSessionAttributes();
		if (!attributes.currentLink) {
			var link = await dropbox_download_link(tokens[userid].access_token, attributes.files[attributes.playingIndex]);
			attributes.currentLink = link;
		}
		handlerInput.attributesManager.setSessionAttributes(attributes);
		return res.speak("Paused.").addAudioPlayerStopDirective().getResponse();
	}
},
{
	name: "AMAZON.ResumeIntent",
	_handle(handlerInput, userid, slots, res) {
		console.dir(handlerInput.requestEnvelope);
		var attributes = handlerInput.attributesManager.getSessionAttributes();
		
		handlerInput.attributesManager.setSessionAttributes(attributes);
		return res.speak("Resumed.")
		          .addAudioPlayerPlayDirective('REPLACE_ALL', attributes.currentLink, attributes.files[attributes.playingIndex], attributes.offset)
		          .getResponse();
	}
},
{
	name: "AudioPlayer.PlaybackStarted",
	_handle(handlerInput, userid, slots, res) {
		var attributes = handlerInput.attributes.getSessionAttributes();
		handlerInput.attributesManager.setSessionAttributes(attributes);
		return res.getResponse();
	}
},
{
	name: "AudioPlayer.PlaybackFinished",
	_handle: async function(handlerInput, userid, slots, res) {
		var attributes = handlerInput.attributes.getSessionAttributes();
		attributes.playingIndex++;
		attributes.offset = 0;
		if (attributes.playingIndex == attributes.downloaded.length)
			return res.speak("File"+(attributes.downloaded.length==1?"":"s")+" ended.");
		handlerInput.attributesManager.setSessionAttributes(attributes);
		var link = await dropbox_download_link(tokens[userid].access_token, attributes.files[attributes.playingIndex]);
		return res.addAudioPlayerPlayDirective('REPLACE_ENQUEUED', link, attributes.files[attributes.playingIndex].substring(1), attributes.offset)
				 .getResponse();
	}
},
{
	name: "AudioPlayer.PlaybackStopped",
	_handle(handlerInput, userid, slots, res) {
		var attributes = handlerInput.attributes.getSessionAttributes();
		attributes.offset = handlerInput.requestEnvelope.request.offset;
		handlerInput.attributesManager.setSessionAttributes(attributes);
		return res.getResponse();
	}
},
{
	name: "AudioPlayer.ClearQueue",
	_handle(handlerInput, userid, slots, res) {
		handlerInput.attributesManager.setSessionAttributes({});
		return res.addAudioPlayerStopDirective().getResponse();
	}
},
{
	name: "AMAZON.HelpIntent",
	_handle: function (handlerInput, userid, slots, res) {
		return res.speak("Tell me which files to play and I will search for them. For example: Alexa, tell dropbox player to search for Radiohead.").reprompt().getResponse();
 	}
},
{
	name: "AMAZON.CancelIntent",
	_handle: function (handlerInput, userid, slots, res) {
		return res.speak("Cancelled.").getResponse();
	}
},
{
	name: "AMAZON.StopIntent",
	_handle: function (handlerInput, userid, slots, res) {
		return res.speak("Stopped.").getResponse();
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
        .speak('Sorry, I can\'t understand the command. Please say again.')
        .reprompt('Sorry, I can\'t understand the command. Please say again.')
        .getResponse();
    }
}

exports.requestHandlers.forEach(handler => {
	var parsedName = handler.name.match(/[A-Z][a-z.]+|AMAZON\.|AudioPlayer\./g);
	if (parsedName == null)
		return;
	if (parsedName[parsedName.length-1] == "Handler")
		parsedName.splice(parsedName.length - 1, 1);

	if (parsedName[parsedName.length-1] == "Request" || parsedName[0] == "AudioPlayer") {
		var requestName = handler.name;
		handler.canHandle = function (handlerInput) {
			return handlerInput.requestEnvelope.request.type == requestName;
		}
	} else if (parsedName[parsedName.length - 1] == "Intent") {
		var intentName = parsedName.slice().join("");
		handler.canHandle = function (handlerInput) {
			return handlerInput.requestEnvelope.request.type == "IntentRequest" &&
				   handlerInput.requestEnvelope.request.intent.name == intentName;
		}
	}

	handler.handle = function (handlerInput) {
		var userId = handlerInput.requestEnvelope.session.user.userId;
		if (typeof tokens[userId] == "undefined") {
			return makeConnectingCard(handlerInput.responseBuilder
					.speak("You have to connect your Dropbox account first. Check your mobile phone for an URL and QR code of it."), handlerInput)
					.getResponse();
		}
		var slots = handlerInput.requestEnvelope.request.intent ? handlerInput.requestEnvelope.request.intent.slots : null;
		return handler._handle(handlerInput, userId, slots, handlerInput.responseBuilder)
	}
});

function makeConnectingCard(response, handlerInput) {
	var userId = handlerInput.requestEnvelope.session.user.userId;
	var link = replaceParameters(dropbox_oauth_url, {app_key: dropbox_app_key, redirect_uri: serverURL, user_id: userId});
	var redirectLink = "/" + randomString(7);
	redirects[redirectLink] = {created: Date.now(), duration: 1000*60*60*6, to: link, userid: userId};
	var smallQrCode = replaceParameters(qrcode_api_url, {data: serverURL + redirectLink, size: "480x480"});
	var largeQrCode = replaceParameters(qrcode_api_url, {data: serverURL + redirectLink, size: "800x800"});
	var fullRedirectLink = serverURL + redirectLink;
	return response.withStandardCard("Dropbox Player", "Connect your Dropbox. Link: " + fullRedirectLink, smallQrCode, largeQrCode);
}