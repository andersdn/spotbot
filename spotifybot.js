"use strict";

var setup = require('./bot_setup.js');
var request = require('request');
var Botkit = require('botkit');
var Spotify = require('spotify-node-applescript');

var https = require('https');
var os = require('os');
var q = require('q');

var lastTrackId;
var channelId;

var request = require('request');

var lastskipreq = false;
var lastskipper = false;

var controller = Botkit.slackbot({
    debug: false
});

var bot = controller.spawn({
    token: setup.token
}).startRTM();



var init = function init() {
    bot.api.channels.list({}, function (err, response) {
        if (err) {
            throw new Error(err);
        }

        if (response.hasOwnProperty('channels') && response.ok) {
            var total = response.channels.length;
            for (var i = 0; i < total; i++) {
                var channel = response.channels[i];
                if (verifyChannel(channel)) {
                    return;
                }
            }
        }
    });

    bot.api.groups.list({}, function (err, response) {
        if (err) {
            throw new Error(err);
        }

        if (response.hasOwnProperty('groups') && response.ok) {
            var total = response.groups.length;
            for (var i = 0; i < total; i++) {
                var channel = response.groups[i];
                if (verifyChannel(channel)) {
                    return;
                }
            }
        }
    });
};


controller.hears(['request'], 'direct_message,direct_mention,mention', function (bot, message) {
    var qry = message.text;
    var qryurl = 'https://api.spotify.com/v1/search?q=' + encodeURI(qry.replace('request','')) + '&type=track';
    request(qryurl, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var results = JSON.parse(body);
            if(!!results.tracks){
                if(!!results.tracks.items && results.tracks.items.length){
                    var tracks = results.tracks.items;
                    var tk = {
                        'track':tracks[0].uri,
                        'name':tracks[0].name,
                        'artist':tracks[0].artists[0].name,
                        'img':tracks[0].album.images[0].url
                    };
                    bot.reply(message, ':headphones: found "' + tk.artist + ' - ' + tk.name + '"\r\n' + tk.img);

                    Spotify.playTrack(tk.track, function(){
                    });

                } else {
                    bot.reply(message, 'Sorry, found nothing');
                }
            } else {
                bot.reply(message, 'no track found for "' + qry + '". maybe thats a good thing.');
            }
        }
    })

});

controller.hears(['help'], 'direct_message,direct_mention,mention', function (bot, message) {


    [
        'You can say these things to me:',
        'next - Fed up with the track? Skip it.',
        'previous - Want to hear that again? Just ask.',
        'start again/over - Missed the beginning of the track? No problem.',
        'play / pause - plays or pauses the music',
        'volume up / down - increases / decreases the volume',
        'info - I will tell you about this track',
        'detail - I will tell you more about this track',
        'request - queue up a song, if in request mode, otherwise play it NOW'
    ].join('\n')

    bot.reply(message,
    // 'set volume [1-100] - sets the volume\n'+
    );
});

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function (bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'radio'
    }, function (err, res) {
        if (err) {
            bot.botkit.log("Failed to add emoji reaction :(", err);
        }
    });

    controller.storage.users.get(message.user, function (err, user) {
        if (user && user.name) {
            bot.reply(message, "Hello " + user.name + "!!");
        } else {
            bot.reply(message, "Hello.");
        }
    });
});

/*
track = {
    artist: 'Bob Dylan',
    album: 'Highway 61 Revisited',
    disc_number: 1,
    duration: 370,
    played count: 0,
    track_number: 1,
    starred: false,
    popularity: 71,
    id: 'spotify:track:3AhXZa8sUQht0UEdBJgpGc',
    name: 'Like A Rolling Stone',
    album_artist: 'Bob Dylan',
    spotify_url: 'spotify:track:3AhXZa8sUQht0UEdBJgpGc' }
}
*/
controller.hears(['what is this', 'what\'s this', 'info', 'playing', 'what is playing', 'what\'s playing'], 'direct_message,direct_mention,mention', function (bot, message) {
    Spotify.getTrack(function (err, track) {
        if (track) {
            lastTrackId = track.id;
            bot.reply(message, 'This is ' + trackFormatSimple(track) + '!');
        }
    });
});

controller.hears(['detail'], 'direct_message,direct_mention,mention', function (bot, message) {
    Spotify.getTrack(function (err, track) {
        if (track) {
            lastTrackId = track.id;
            getArtworkUrlFromTrack(track, function (artworkUrl) {
                bot.reply(message, trackFormatDetail(track) + "\n" + artworkUrl);
            });
        }
    });
});

controller.hears(['next', 'skip'], 'direct_message,direct_mention,mention', function (bot, message) {

    var newskipper = message.user;

    var timenow = Math.floor(Date.now() / 1000);
    if (timenow - lastskipreq < 30) {
        if ((newskipper && newskipper !== lastskipper) || !lastskipper) {
            Spotify.next(function (err, track) {
                bot.reply(message, 'Skipping to the next track...');
            });
        } else {
            bot.reply(message, 'Uhhh, you can\'t vote for your own skip...');
        }
    } else {
        bot.reply(message, 'Need another next or skip within 30 seconds to skip...');
    }
    lastskipper = newskipper;
    lastskipreq = Math.floor(Date.now() / 1000);

});

controller.hears(['previous', 'prev'], 'direct_message,direct_mention,mention', function (bot, message) {
    Spotify.previous(function (err, track) {
        bot.reply(message, 'Skipping back to the previous track...');
    });
});

controller.hears(['start [again|over]'], 'direct_message,direct_mention,mention', function (bot, message) {
    Spotify.jumpTo(0, function (err, track) {
        bot.reply(message, 'Going back to the start of this track...');
    });
});




controller.hears(['^play$', 'resume', 'go'], 'direct_message,direct_mention,mention', function (bot, message) {
    Spotify.getState(function (err, state) {
        if (state.state == 'playing') {
            bot.reply(message, 'Already playing...');
            return;
        }

        Spotify.play(function () {
            bot.reply(message, 'Resuming playback...');
        });
    });
});

controller.hears(['stop', 'pause', 'shut up'], 'direct_message,direct_mention,mention', function (bot, message) {

    Spotify.getState(function (err, state) {
        if (state.state != 'playing') {
            bot.reply(message, 'Not currently playing...');
            return;
        }

        Spotify.pause(function () {
            bot.reply(message, 'Pausing playback...');
        });
    });
});

controller.hears(['louder( \\d+)?', 'volume up( \\d+)?', 'pump it( \\d+)?'], 'direct_message,direct_mention,mention', function (bot, message) {
    var increase = message.match ? parseInt(message.match[1], 10) : undefined;
    Spotify.getState(function (err, state) {
        var volume = state.volume;

        if (volume == 100) {
            bot.reply(message, 'Already playing at maximum volume!');
            return;
        }

        var newVolume = increase ? volume + increase : volume + 10;
        if (!newVolume) {
            return;
        } else if (newVolume > 100) {
            newVolume = 100;
        }

        Spotify.setVolume(newVolume, function () {
            bot.reply(message, 'Increased volume from ' + volume + ' to ' + newVolume);
        });
    });
});

controller.hears(['quieter( \\d+)?', 'volume down( \\d+)?', 'shhh( \\d+)?'], 'direct_message,direct_mention,mention', function (bot, message) {
    var decrease = message.match ? parseInt(message.match[1], 10) : undefined;
    Spotify.getState(function (err, state) {
        var volume = state.volume;

        if (volume == 0) {
            bot.reply(message, 'I can\'t go any lower... (my career as a limbo dancer was a short one)');
            return;
        }

        var newVolume = decrease ? volume - decrease : volume - 10;
        if (!newVolume && newVolume !== 0) {
            return;
        } else if (newVolume < 0) {
            newVolume = 0;
        }

        Spotify.setVolume(newVolume, function () {
            bot.reply(message, 'Decreased volume from ' + volume + ' to ' + newVolume);
        });
    });
});

controller.hears('set volume (\\d+)', 'direct_message,direct_mention,mention', function (bot, message) {
    console.log('set vol', message);
    var volume = message.match ? parseInt(message.match[1], 10) : undefined;
    Spotify.getState(function (err, state) {
        var oldVolume = state.volume;

        if (volume !== undefined && volume >= 0 && volume <= 100) {
            Spotify.setVolume(volume, function () {
                bot.reply(message, 'Changed volume from ' + oldVolume + ' to ' + volume);
            });
            return;
        }

        bot.api.reactions.add({
            timestamp: message.ts,
            channel: message.channel,
            name: 'trollface'
        }, function (err, res) {
            if (err) {
                bot.botkit.log("Failed to add emoji reaction :(", err);
            }
        });
        bot.reply(message, 'Volume can be set from 0-100');
    });
});

controller.on('bot_channel_join', function (bot, message) {
    var inviterId = message.inviter;
    var channelId = message.channel;
    var inviter, channel;

    var done = function done() {
        if (inviter && channel) {
            inviteMessage(inviter, channel);
            verifyChannel(channel);
        }
    };

    bot.api.channels.info({ channel: channelId }, function (err, response) {
        if (response && !err) {
            channel = response.channel;
            done();
        }
    });

    bot.api.users.info({ user: inviterId }, function (err, response) {
        if (response && !err) {
            inviter = response.user;
            done();
        }
    });
});

controller.on('bot_group_join', function (bot, message) {
    var inviterId = message.inviter;
    var channelId = message.channel;
    var inviter, channel;

    var done = function done() {
        if (inviter && channel) {
            inviteMessage(inviter, channel);
            verifyChannel(channel);
        }
    };

    bot.api.groups.info({ channel: channelId }, function (err, response) {
        if (response && !err) {
            channel = response.group;
            done();
        }
    });

    bot.api.users.info({ user: inviterId }, function (err, response) {
        if (response && !err) {
            inviter = response.user;
            done();
        }
    });
});

function inviteMessage(inviter, channel) {
    Spotify.getTrack(function (err, track) {
        var nowPlaying;
        var welcomeText = 'Thanks for inviting me, ' + inviter.name + '! Good to be here :)\n';

        if (track) {
            lastTrackId = track.id;
            getArtworkUrlFromTrack(track, function (artworkUrl) {
                bot.say({
                    text: welcomeText + 'Currently playing: ' + trackFormatSimple(track),
                    channel: channel.id
                });
            });
        } else {
            bot.say({
                text: welcomeText + 'There is nothing currently playing',
                channel: channel.id
            });
        }
    });
}

setInterval(function () {
    checkRunning().then(function (running) {
        if (running) {
            checkForTrackChange();
        } else {
            if (lastTrackId !== null) {
                bot.say({
                    text: 'Oh no! Where did Spotify go? It doesn\'t seem to be running 😨',
                    channel: channelId
                });
                lastTrackId = null;
            }
        }
    });
}, 5000);

function checkRunning() {
    var deferred = q.defer();

    Spotify.isRunning(function (err, isRunning) {
        if (err || !isRunning) {
            return deferred.resolve(false);
        }

        return deferred.resolve(true);
    });

    return deferred.promise;
}

function checkForTrackChange() {
    Spotify.getTrack(function (err, track) {
        if (track && track.id !== lastTrackId) {
            if (!channelId) return;

            lastTrackId = track.id;

            getArtworkUrlFromTrack(track, function (artworkUrl) {
                bot.say({
                    text: 'Now playing: ' + trackFormatSimple(track) + ' (' + track['played_count'] + ' plays)\n' + artworkUrl,
                    channel: channelId
                });
            });
        }
    });
}

var trackFormatSimple = function trackFormatSimple(track) {
    return '_' + track.name + '_ by *' + track.artist + '*';
};
var trackFormatDetail = function trackFormatDetail(track) {
    return '_' + track.name + '_ by _' + track.artist + '_ is from the album *' + track.album + '*\nIt has been played ' + track['played_count'] + ' time(s).';
};
var getArtworkUrlFromTrack = function getArtworkUrlFromTrack(track, callback) {
    var trackId = track.id.split(':')[2];
    var reqUrl = 'https://api.spotify.com/v1/tracks/' + trackId;
    var req = https.request(reqUrl, function (response) {
        var str = '';

        response.on('data', function (chunk) {
            str += chunk;
        });

        response.on('end', function () {
            var json = JSON.parse(str);
            if (json && json.album && json.album.images && json.album.images[1]) {
                callback(json.album.images[1].url);
            } else {
                callback('');
            }
        });
    });
    req.end();

    req.on('error', function (e) {
        console.error(e);
    });
};

controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'], 'direct_message,direct_mention,mention', function (bot, message) {
    var hostname = os.hostname();
    var uptime = formatUptime(process.uptime());

    bot.reply(message, ':robot_face: I am a bot named <@' + bot.identity.name + '>. I have been running for ' + uptime + ' on ' + hostname + ".");
});

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}

function verifyChannel(channel) {
    if (channel && channel.name && channel.id && setup.channel && channel.name == setup.channel) {
        channelId = channel.id;
        console.log('** ...chilling out on #' + channel.name);
        return true;
    }

    return false;
}

init();