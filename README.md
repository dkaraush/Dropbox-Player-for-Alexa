# Dropbox Alexa Player
An Alexa skill, which can play music from your dropbox storage.

## Installation
1. Download or clone repository.
2. Make `npm install` and `npm start` ~~(or `node index`)~~.
3. Make a Dropbox App and put URL (with path: `/receive-auth/`) to redirect URIs.
4. Also put your Last.FM token code in `config.json`, if you have it (optional).

If you have a HTTPS connection, put also your server URL and change an HTTP port. If you don't have: app will run ngrok and you will receive your own HTTPS url.

4. Make a skill in Alexa Console and put interaction model from `interaction-model.json`.
5. In Endpoint choose HTTPS and put your URI (don't forget about path: `/alexa/`). If you use ngrok, choose second variant of certification (`...sub-domain of a domain that has a...`)
6. In `Account Linking` put two URIs (with paths: `/auth/` and `/token/`).

#### Why I should put this URIs to Dropbox app and Alexa instead of putting Dropbox's URIs?
Unfortunately, Amazon Linking Account sends a huge `state` string (up to 550 symbols) to Dropbox OAuth2. Dropbox doesn't allow this, because it has a limit of 500 bytes. Also, on the second POST request to get an `access_token`, Amazon sends argument `client_id` with authorization header: dropbox doesn't allow this, too. The only way to fix it is to put own URIs, receive requests, change arguments and redirect (OAuth2 form) or make own request to Dropbox.

## Update
You can update repo by doing this:
```
node wrapper update
```
It will download zip with repo, remove all files except configs and data, unzip and make `npm install`.
You can also do that from stats page (check logs for its URL).

## Skill Usage
**Search and play files**:

- Alexa, ask dropbox player to play mozart
- Alexa, ask dropbox player to search for mozart files
- Alexa, tell dropbox player to play Radiohead files

**Play all MP3 files**:

- Alexa, ask dropbox player to play all
- Alexa, ask dropbox player to play all files

**Audio player**:

- Alexa, pause
- Alexa, resume
- Alexa, next
- Alexa, previous
- Alexa, loop on
- Alexa, loop off
- Alexa, shuffle on
- Alexa, shuffle off

**Set default values**:

- Alexa, ask dropbox player to set default loop to ON
- Alexa, ask dropbox player to set default shuffle to OFF

**Push new files into playing list**:

- Alexa, ask dropbox player to push mozart files
- Alexa, ask dropbox player to add Radiohead
- Alexa, ask dropbox player to append Lemon Tree
