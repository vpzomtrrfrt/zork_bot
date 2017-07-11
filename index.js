var game = require('./gamecontrol');
var snoowrap = require('snoowrap');
var util = require('util');
var Q = require('q');

var db = require('then-levelup')(require('levelup')('./data', {
	valueEncoding: 'hex'
}));

var reddit = new snoowrap({
	clientId: process.env.REDDIT_CLIENT_ID,
	clientSecret: process.env.REDDIT_CLIENT_SECRET,
	refreshToken: process.env.REDDIT_REFRESH_TOKEN,
	userAgent: 'zork_bot'
});

function postResponse(result, message) {
	return message.reply(result.response.replace('\n', '  \n'))
	.then(function(reply) {
		return reddit.markMessagesAsRead([message])
		.then(function() {
			return db.put(reply.name, result.save);
		});
	});
}

reddit.getMe().then(function(me) {
	var username = me.name;

	function handleMessage(message) {
		console.log(message);
		if(message.body.indexOf('+/u/'+username) > -1) {
			return game.startGame()
				.then(function(result) {
					return postResponse(result, message);
				});
		}
		else if(message.parent_id) {
			return db.get(message.parent_id)
			.then(function(save) {
				console.log("save found for "+message.parent_id);
				if(save.length < 1) {
					return reddit.markMessagesAsRead([message]);
				}
				console.log("running '"+message.body+"'");
				return game.runMove(message.body, Buffer.from(save, 'hex'))
				.then(function(result) {
					console.log(result);
					return postResponse(result, message);
				});
			}, function(err) {
				console.log(typeof err, err, err.type);
				if(err.type === "NotFoundError") {
					return reddit.markMessagesAsRead([message]);
				}
			});
		}
		return Promise.resolve();
	}

	function mainLoop() {
		reddit.getUnreadMessages()
		.then(function(messages) {
			return Q.all(messages.map(function(message) {
				return handleMessage(message)
					.catch(console.error);
			}));
		})
		.then(function() {
			console.log("complete");
			setTimeout(mainLoop, 5000);
		});
	}
	mainLoop();
});
