var pty = require('node-pty');
var ansiStrip = require('strip-ansi');
var util = require('util');
var tmp = require('tmp-promise');
var fs = require('mz/fs');

var MOVES_RE = /Moves: [0-9]+      [^ ]*\[0m[^\033]/g;

var COMMAND = process.env.ZORK_COMMAND || "zork1";

function runMove(move, save) {
	return Promise.all([tmp.file(), tmp.file()])
	.then(function(files) {
		var file1 = files[0];
		var file2 = files[1];
		var proc;
		var foundMove = null;
		return fs.writeFile(file1.path, save)
		.then(function() {
			return new Promise(function(resolve, reject) {
				move = ""+move;
				var output = "";
				var loaded = false;
				var response;
				proc = pty.spawn(COMMAND, [], {});
				proc.on('data', function(data) {
					output += data.toString();
					if(!loaded && data.indexOf('>') > -1) {
						loaded = true;
						proc.write("restore\n"+file1.path+"\n");
						proc.write(move+'\n');
						proc.write("save\n"+file2.path+"\nY");
						proc.end();
					}
					var text = data;
					var match;
					while((match = MOVES_RE.exec(output)) !== null) {
						var sub = output.substring(match.index+match[0].length, match.index+match[0].length+move.length);
						if(sub === move) {
							foundMove = match.index+match[0].length+move.length;
							break;
						}
					}
					if(foundMove && !response) {
						var remain = output.substring(foundMove);
						var match = remain.match(/\033\[[0-9]+;[0-9]H>/);
						if(match != null) {
							var end = match.index;
							response = ansiStrip(remain.substring(0, end)).replace(/        ?/g, '').trim();
							console.log("responding with", response);
						}
						else {
							console.log("didn't find match in", remain.replace(/\033/g, "^["));
						}
					}
					if(output.indexOf(file2.path) > -1) {
						console.log("returning", response);
						resolve(response);
					}
				});
				proc.on('exit', function(code) {
					console.log("exited with code "+code);
					reject("exited with code "+code);
				});
			});
		})
		.then(function(response) {
			return fs.readFile(file2.path)
			.then(function(save) {
				proc.kill();
				return {
					response: response,
					save: save
				};
			});
		});
	});
}

function startGame() {
	return tmp.file()
	.then(function(file) {
		return new Promise(function(resolve, reject) {
			var proc = pty.spawn(COMMAND, [], {});
			var output = "";
			var done = false;
			var loaded = false;
			proc.on('data', function(data) {
				if(done) return;
				if(!loaded && data.indexOf('>') > -1) {
					loaded = true;
					proc.write("save\n"+file.path+"\nY");
					proc.end();
				}
				output += data;
				if(output.indexOf(file.path) > -1) {
					done = true;
					var end = output.indexOf(">\033[2;1H");
					var start = output.indexOf("\n");
					var text = ansiStrip(output.substring(start+1, end+1)).replace(/        ?/g, '').trim();
					resolve(text);
				}
			});
			proc.on('end', function() {
				console.log("end");
			});
		})
		.then(function(response) {
			return fs.readFile(file.path)
			.then(function(save) {
				return {
					response: response,
					save: save
				};
			});
		});
	});
}

if(require.main === module) {
	/*runMove("open mailbox", fs.readFileSync('../tmp'))
	.then(function(result) {
		console.log(result);
	});*/
	startGame()
	.then(console.log);
}

module.exports = {
	startGame: startGame,
	runMove: runMove
};
