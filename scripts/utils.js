/*
	utils.js - a file with standard functions
*/

if (typeof fs === "undefined") fs = require("fs");

global.loadJSONFile = function (filename, defaultValue, strong) {
	if (!fs.existsSync(filename)) {
		fs.writeFileSync(filename, JSON.stringify(defaultValue, "", "\t"));
		if (strong)
			throw "Put your data to config file (" + filename + ")";
		else return defaultValue;
	}

	var json;
	try {
		json = JSON.parse(fs.readFileSync(filename).toString());
	} catch (e) {
		throw e;
	}

	for (var key in defaultValue)
		if (typeof json[key] === "undefined")
			json[key] = defaultValue[key];

	return json;
}

global.saveJSONFile = function (filename, content) {
	if (typeof content !== "string")
		content = JSON.stringify(content, "", "\t");
	fs.writeFileSync(filename, content);
}

global.parseQuery = function (query_string) {
	var query = {};
	var params = query_string.split("&");
	for (var i = 0; i < params.length; ++i) {
		var key = params[i].substring(0, params[i].indexOf("="));
		var value = params[i].substring(params[i].indexOf("=")+1);
		query[decodeURIComponent(key)] = decodeURIComponent(value);
	}
	return query;
}

global.replaceParameters = function (template, parameters) {
	for (var key in parameters)
		template = template.replace("{"+key.toUpperCase()+"}", parameters[key]);
	return template;
}

global.randomString = function (n) {
	var q = "qwertyuiopasdfghjklzxcvbnm1234567890QWERTYUIOPASDFGHJKLZXCVBNM";
	return Array.from({length: n}, x => q[~~(Math.random() * (q.length - 1))]).join("");
}

global.stringifyQuery = function (obj) {
	var string = "";
	for (var key in obj)
		string += encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]) + "&";
	string = string.substring(0, string.length-1);
	return string;//Array.from(Object.keys(obj), (key, i) => encodeURIComponent(key) + "=" + encodeURIComponent(obj[key]) + (Object.keys(obj).length == i+1 ? "" : "&")).join("");
}

global.getRawQuery = function (req) {
	return (req.url.indexOf("?") >= 0) ? req.url.substring(req.url.indexOf("?")+1) : "";
}

global.upperCaseHeader = function (str) {
	return str.replace(/(^|-)(\w)/g, a => a.toUpperCase());
}

Array.prototype.random = function () {
	return this[~~(Math.random() * (this.length - 1))]
}