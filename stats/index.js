const body_filename = "body.html";
var rules = {
	"main": "users.html",
	"users": "users.html",
	"user": "user.html",
	"event": "event.html",
	"status": "status.html"
}

const eventsPerPage = 10;
var fields = {
	"STATS_URL": () => exports.url,
	"CURRENT_USER_ID": query => query.id,
	"CURRENT_USER_LAST_TEXT": query => dateDifferenceString(statistics[query.id].last_activity, Date.now()),
	"CURRENT_USER_LAST_DATETIME": query => datetimeString(statistics[query.id].last_activity),
	"CURRENT_USER_LAST_TIMESTAMP": query => statistics[query.id].last_activity,
	"CURRENT_USER_DROPBOX_CONNECTED": query => "✖✔"[statistics[query.id].dropbox.connected+0],
	"CURRENT_USER_DROPBOX_TOKEN": query => statistics[query.id].dropbox.access_token,
	"CURRENT_USER_HAS_DISPLAY": query => "✖✔"[statistics[query.id].device.display+0],	
	"EVENTS_CURRENT_PAGE": query => {
		if (!query.event_page || query.event_page < 0 || query.event_page >= (Math.ceil(statistics[query.id].events_count) / eventsPerPage))
			return Math.ceil(statistics[query.id].events_count / eventsPerPage);
		return parseInt(query.event_page)+1;
	},
	"EVENTS_PAGE_COUNT": query => Math.ceil(statistics[query.id].events_count / eventsPerPage),
	"USERS_COUNT": () => Object.keys(statistics).length,
	"CONFIG": () => JSON.stringify(config, null, "\t")
}
var templates = {
	"USER_TEMPLATE": {
		array: () => Array.from(Object.keys(statistics), x => statistics[x]).sort((a,b)=>a.last_activity>b.last_activity?-1:(a.last_activity<b.last_activity?1:0)),
		ifempty: () => "<div id='empty'>Empty :C</div>",
		"USER_ID": (user) => user.id,
		"USER_LAST": (user) => dateDifferenceString(user.last_activity, Date.now())
	},
	"EVENT_TEMPLATE": {
		array: query => {
			var arr = JSON.parse(fs.readFileSync("stats/data/"+statistics[query.id].filename).toString()).reverse();
			if (arr.length <= eventsPerPage || !query.event_page)
				return arr;
			var maxPages = Math.ceil(arr.length / eventsPerPage)
			if (!query.event_page || query.event_page < 0 || query.event_page >= maxPages)
				query.event_page = maxPages-1;
			return chunkArray(arr, eventsPerPage).reverse()[query.event_page];
		},
		ifempty: () => "<div id='empty'>Empty :C</div>",
		"EVENT_SHORT": event => event.short,
		"EVENT_TIME_DIFFERENCE": event => dateDifferenceString(event.time, Date.now()),
		"EVENT_INDEX": event => event.index
	},
	"EVENT_INFO_TEMPLATE": {
		array: query => [JSON.parse(fs.readFileSync("stats/data/"+statistics[query.id].filename).toString())[query.event]],
		"EVENT_TIME_DIFFERENCE": event => dateDifferenceString(event.time, Date.now()),
		"EVENT_TIME_FULL": event => datetimeString(event.time),
		"EVENT_REQUEST": event => event.request,
		"EVENT_RESPONSE": event => event.response,
		"EVENT_REQUEST_HEADERS": event => event.headersReq,
		"EVENT_RESPONSE_HEADERS": event => event.headersRes,
		"EVENT_PLAYERDATA_WAS": event => JSON.stringify(event.playingDataWas,null,"\t"),
		"EVENT_PLAYERDATA_NOW": event => JSON.stringify(event.playingDataNow,null,"\t")
	},
	"PLAYER_DATA_TEMPLATE": {
		array: query => playingData[query.id] ? [playingData[query.id]] : [],
		"FILES_LENGTH": data => data.files.length,
		"FILES_STRING": data => JSON.stringify(Array.from(data.files, f => (f && f.length > 50) ? f.substring(0,50)+"..." : f), null, "\t"),
		"LOADED_LINKS_LENGTH": data => data.links.filter(l => l != null).length,
		"LINKS_STRING": data => JSON.stringify(Array.from(data.links, l => (l && l.length > 50) ? l.substring(0,50)+"..." : l), null, "\t"),
		"CURRENT_LOOP": data => data.loop ? "true" : "false",
		"CURRENT_SHUFFLE": data => data.shuffle ? "true" : "false",
		"PLAYING_INDEX": data => data.playingIndex,
		"NEXT_INDEX": data => data.nextIndex,
		"OFFSET": data => data.offset,
		"DEFAULT_LOOP": data => data.defaultLoop,
		"DEFAULT_SHUFFLE": data => data.defaultShuffle
	}
}

exports.url = null;
exports.receive = function (req, res, url, query) {
	// url formatting
	if (url[0] == "/")
		url = url.substring(1);

	if (url.indexOf("/") == -1)
		url = "main";
	else 
		url = url.substring(url.indexOf("/")+1);

	if (url[url.length - 1] == "/")
		url = url.substring(0, url.length-1);

	var dirs = url.split("/");
	if (url == "restart") {
		res.statusCode = 302;
		res.setHeader("Location", serverURL + "/" + exports.url + "/");
		res.end();
		process.exit(15);
	} else if (url == "update") {
		res.statusCode = 302;
		res.setHeader("Location", serverURL + "/" + exports.url + "/");
		res.end();
		process.exit(17);
	}

	if (Object.keys(rules).indexOf(dirs[0]) == -1) {
		url = "main";
		dirs = ["main"];
	}
	// ====

	var body = fs.readFileSync("stats/"+body_filename).toString();
	var content = body.replace("{{CONTENT}}",fs.readFileSync("stats/"+rules[dirs[0]]).toString());
	for (var field in fields) {
		content = content.replace(new RegExp("\\{"+field+"\\}","g"), function () {
			try {
				return fields[field](query)
			} catch (e) {}
		});
	}
	for (var templateName in templates) {
		var template = templates[templateName];
		content = content.replace(new RegExp("\\{\\{\\{"+templateName+"(.+)\\}\\}\\}", "mgs"), function (full,code) {
			var result = "";
			try {
				var array = template.array(query);
			} catch (e) {return "";}
			for (var i = 0; i < array.length; ++i) {
				var current = code;
				for (var field in template) {
					if (field == "array" || field == "ifempty")
						continue;
					current = current.replace(new RegExp("\\{"+field+"\\}","g"), function () {
						try {
							return template[field](array[i]);
						} catch (e) {}
					});
				}
				result += current;
			}
			if (array.length == 0 && typeof template.ifempty !== "undefined") {
				result = template.ifempty();
			}
			return result;
		});
	}
	res.end(content);
}

var statistics = loadJSONFile("stats.json", {}, false);
exports.reportAlexa = function(req_body, res_body, headersReq, headersRes, w_pl, pl) {
	var req = JSON.parse(req_body);
	var context, user;
	try {
		context = req.context.System;
		user = context.user;
	} catch (e) {
		return; // it's another request - not amazon
	}
	if (typeof statistics[user.userId] === "undefined") {
		statistics[user.userId] = {
			id: user.userId
		};
	}
	var s = statistics[user.userId];
	s.dropbox = {connected: !!user.accessToken, access_token: user.accessToken};
	s.device = {display: Object.keys(context.device.supportedInterfaces).indexOf("Display")>=0, id: context.device.deviceId };
	s.last_activity = Date.now();
	var events;
	if (!s.filename || !fs.existsSync("stats/data/"+s.filename)) {
		s.filename = randomString(32) + ".json";
		if (!fs.existsSync("stats/data"))
			fs.mkdirSync("stats/data");
		events = [];
	} else {
		events = JSON.parse(fs.readFileSync("stats/data/"+s.filename).toString());
	}
	events.push({
		index: events.length,
		request: req_body,
		response: res_body,
		headersReq,
		headersRes,
		time: Date.now(),
		short: getShortInfo(req),
		playingDataWas: w_pl,
		playingDataNow: pl
	});
	s.events_count = events.length;
	fs.writeFileSync("stats/data/"+s.filename, JSON.stringify(events));
}

exports.save = function () {
	saveJSONFile("stats.json", JSON.stringify(statistics));
}


function getShortInfo(q, s) {
	if (q.request.type == "IntentRequest") {
		return q.request.intent.name;
	} else 
		return q.request.type;
}