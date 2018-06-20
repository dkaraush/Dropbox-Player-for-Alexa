'use strict';

exports.requestHandlers = [
{
	name: "LaunchRequest",
	_handle(handlerInput, userid, res) {
		return res.speak("Your dropbox account successfully connected. Tell me what to play.")
			   .reprompt()
			   .getResponse();	
	}
},
{
	name: "SessionEndedRequest",
	_handle(handlerInput, userid, res) {
		return res.speak("Goodbye!")
				.getResponse();
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



function checkAccessTokens(input) {
	var userId = input.requestEnvelope.session.user.userId;

}


exports.requestHandlers.forEach(handler => {
	var parsedName = handler.name.match(/[A-Z][a-z]+/g);
	if (parsedName == null)
		return;
	if (parsedName[parsedName.length-1] == "Handler")
		parsedName.splice(parsedName.length - 1, 1);
	if (parsedName[parsedName.length-1] == "Request") {
		var requestName = handler.name;
		handler.canHandle = function (handlerInput) {
			return handlerInput.requestEnvelope.request.type == requestName;
		}
	} else if (parsedName[parsedName.length - 1] == "Intent") {
		var intentName = (parsedName.slice(0, parsedName.length-1));
		handler.canHandle = function (handlerInput) {
			return handlerInput.requestEnvelope.request.type == "IntentRequest" &&
					handlerInput.requestHandlers.request.intent.name == intentName;
		}
	}

	handler.handle = function (handerInput) {
		var userId = handerInput.requestEnvelope.session.user.userId;
		if (typeof tokens[userId] == "undefined") {
			var link = replaceParameters(dropbox_oauth_url, {app_key: dropbox_app_key, redirect_uri: serverURL, user_id: userId});
			var redirectLink = "/" + randomString(16);
			redirects[redirectLink] = {created: Date.now(), duration: 1000*60*60*6, to: link};
			var smallQrCode = replaceParameters(qrcode_api_url, {data: link, size: "480x480"});
			var largeQrCode = replaceParameters(qrcode_api_url, {data: link, size: "800x800"});
			var fullRedirectLink = serverURL + redirectLink;
			console.log(serverURL);
			return handerInput.responseBuilder
					.speak("You have to connect your Dropbox account first. Check your mobile phone for an URL and QR code of it.")
					.withStandardCard("Dropbox Player", "Connect your Dropbox. Link: " + fullRedirectLink, smallQrCode, largeQrCode)
					.getResponse();
		}
		return handler._handle(handerInput, handerInput.requestEnvelope.session.user.userId, handerInput.responseBuilder)
	}
});
