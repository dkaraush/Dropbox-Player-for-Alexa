# Dropbox Alexa Player
An Alexa skill, which can play music from your dropbox storage.

## Installation
1. Download or clone repository.
2. Make `npm install` and `npm start` (or `node index`)
3. Make a Dropbox App and put your app key and app secret in `config.json`.

If you have a HTTPS connection, put also your server URL and change an HTTP port. If you don't have: app will run ngrok and you will receive your own HTTPS url.

4. Make a skill in Alexa Console and put interaction model from `interaction-model.json`.
5. In Endpoint choose HTTPS and put your URI (don't forget about path: `/alexa/`). If you use ngrok, choose second variant of certification (`...sub-domain of a domain that has a...`)
