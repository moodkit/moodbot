let stringTable = require('string-table');
let Promise = require('promise');
let rp = require('request-promise');
let RtmClient = require('@slack/client').RtmClient;
let RTM_EVENTS = require('@slack/client').RTM_EVENTS;

let bot_token = process.env.SLACK_BOT_TOKEN;
let host = process.env.HOST;

let rtm = new RtmClient(bot_token);

let channel;

let users;

// // The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
// rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
//     // for (const c of rtmStartData.channels) {
//     // if (c.is_member && c.name ==='prove-bot') { channel = c.id }
//     // }
//     console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
// });

// // you need to wait for the client to fully connect before you can send messages
// rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
//     rtm.sendMessage("Hello!", channel);
// });

function process(str) {
    return str.substring(0, str.length - 3) + "000";
}

function validate(emoji, value) {
    if (emoji.charAt(0) !== ':') return false;
    if (emoji.charAt(emoji.length - 1) !== ':') return false;
    if (value < 1 || value > 10) return false;
    return true;
}

function getUserId(message) {
    let options = {
        method: 'GET',
        uri: host + '/users',
        qs: {
            slug: message['user']
        }
    };
    return rp(options).then(function (body) {
        let result = JSON.parse(body);
        if (result.length === 0) {
            Promise.resolve(rtm.dataStore.getUserById(message['user'])).then(user => {
                let create_options = {
                    method: 'POST',
                    uri: host + '/users',
                    form: {
                        name: user['real_name'],
                        slug: message['user'],
                        email: user.profile['email']
                    }
                };
                rp(create_options).then(() => function (body) {
                    let result = JSON.parse(body);
                    rtm.sendMessage(result['Message'], message['channel']);
                    return true;
                }).then(() => rp(options).then(function (body) {
                    const res = JSON.parse(body);
                    return res[0]['id'];
                }))
            });
        } else {
            return result[0]['id'];
        }
    }).catch(function (err) {
        console.log(err);
        return -1;
    });
}


rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
    let xx = rtm.dataStore.getChannelGroupOrDMById(message['channel']);
    console.log("test", xx);

    if ('text' in message) {
        if (message['text'] === "users") {
            rp(host + '/users')
                .then((json) => {
                    let response = "```" + stringTable.create(JSON.parse(json)) + "```";
                    rtm.sendMessage(response, message['channel']);
                }).catch((err) => console.error(err));
        } else if (message['text'].indexOf('feel') === 0 && message['text'].split(' ').length === 3) {
            let timestamp = message['ts'].split('.')[0];
            let emoji = message['text'].split(' ')[1];
            let value = parseInt(message['text'].split(' ')[2]);
            if (validate(emoji, value)) {
                getUserId(message).then(user_id => {
                    if (user_id > -1) {
                        let options = {
                            method: 'POST',
                            uri: host + '/moods',
                            form: {
                                timestamp: process(timestamp),
                                label: emoji,
                                value: value,
                                user_id: user_id
                            }
                        };
                        rp(options).then(function (body) {
                            let result = JSON.parse(body);
                            rtm.sendMessage(result['Message'], message['channel']);
                        }).catch(function (err) {
                            console.log(err);
                        });
                    } else {
                        rtm.sendMessage("Unknown error!", message['channel']);
                    }
                });
            } else {
                rtm.sendMessage("Please provide valid emoji and value (1 - 10)!", message['channel']);
            }
        } else if (message['text'] === "history") {
            let timestamp = parseInt(message['ts'].split('.')[0]);
            getUserId(message).then(user_id => {
                if (user_id > -1) {
                    const options = {
                        method: 'GET',
                        uri: host + '/moods',
                        qs: {
                            'start_date': timestamp - 604800,
                            'end_date': timestamp,
                            'user_id': user_id
                        }
                    };
                    rp(options).then((json) => {
                        let raw = JSON.parse(json);
                        let result = "";
                        for (const item of raw) {
                            let theDate = new Date(parseInt(item['timestamp']) * 1000);
                            result += theDate.toDateString() + " " + item['label'] + " " + item['value'] + "\n";
                        }
                        if (result.length > 0) {
                            rtm.sendMessage(result, message['channel']);
                        } else {
                            rtm.sendMessage("No mood found!", message['channel']);
                        }
                    }).catch((err) => console.error(err));
                } else {
                    rtm.sendMessage("User does not exist!", message['channel']);
                }
            });
        } else if (message['text'] === 'whoami') {
            let user = rtm.dataStore.getUserById(message['user']);
            rtm.sendMessage(user.profile['real_name'], message['channel']);
        } else {
            // Nothing
        }
    } else {
        // Nothing
    }
});

rtm.start();
