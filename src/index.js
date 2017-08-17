"use strict";

let CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
let stringTable = require('string-table');
let Promise = require('promise');
let rp = require('request-promise');
let RtmClient = require('@slack/client').RtmClient;
let RTM_EVENTS = require('@slack/client').RTM_EVENTS;

let bot_token = process.env.SLACK_BOT_TOKEN;
let host = process.env.HOST;

let rtm = new RtmClient(bot_token);

let moodId;

let users;

// // The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  moodId = rtmStartData.self.id;
  console.log(
      `Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  console.log('Now you can start talking!');
});

function cutTime(str) {
  let x = Math.floor(parseInt(str) / 86400);
  return x * 86400;
}

function getUserId(userId) {
  if (userId === moodId) {
    return Promise.resolve(-1);
  }
  let options = {
    method: 'GET',
    uri: host + '/users',
    qs: {
      slug: userId
    }
  };
  return rp(options).then(function (body) {
    let result = JSON.parse(body);
    if (result.length === 0) {
      Promise.resolve(rtm.dataStore.getUserById(userId)).then(user => {
        let create_options = {
          method: 'POST',
          uri: host + '/users',
          form: {
            name: user['real_name'],
            slug: userId,
            email: user.profile['email']
          }
        };
        rp(create_options).then(() => function (body) {
          let result = JSON.parse(body);
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
    return Promise.resolve(-1);
  });
}

rtm.on(RTM_EVENTS.MESSAGE, function handleRtmMessage(message) {
  let chan = rtm.dataStore.getChannelGroupOrDMById(message['channel']);
  let is_channel = chan['is_channel'];
  let can_answer = !is_channel;
  let messageText;
  let re = /^fe[e]+l[a-z]*\s:[a-z]+:\s[1-6](\s".*")?$/g;
  let snippet_re = /".*"$/g;

  if ('message' in message && 'text' in message['message']) {
    messageText = message['message'];
  } else if ('text' in message) {
    messageText = message;
  }
  if (messageText) {
    if (!can_answer) {
      can_answer = messageText['text'].indexOf("<@" + moodId
          + ">") >= 0;
    }
    if (messageText['text'] === "users") {
      rp(host + '/users')
      .then((json) => {
        let response = "```" + stringTable.create(JSON.parse(json)) + "```";
        rtm.sendMessage(response, message['channel']);
      }).catch((err) => console.error(err));
    } else if (messageText['text'].toLowerCase().match(re) !== null) {
      let timestamp = messageText['ts'].split('.')[0];
      let emoji = messageText['text'].split(' ')[1];
      let value = parseInt(messageText['text'].split(' ')[2]);
      let snippet = messageText['text'].match(snippet_re);
      getUserId(messageText['user']).then(user_id => {
        if (user_id > -1) {
          let options = {
            method: 'POST',
            uri: host + '/moods',
            form: {
              timestamp: cutTime(timestamp),
              label: emoji,
              value: value,
              user_id: user_id
            }
          };
          rp(options).then(function (body) {
            let result = JSON.parse(body);
            if (result['StatusCode'] === '200') {
              rtm.sendMessage(result['Message'], message['channel']);
            } else {
              rtm.sendMessage(
                  "We have your mood today. Reach out to me tomorrow.",
                  message['channel']);
            }
          }).then(function (body) {
            if (snippet) {
              let snippet_options = {
                method: 'POST',
                uri: host + '/snippet',
                form: {
                  timestamp: cutTime(timestamp),
                  content: snippet,
                  user_id: user_id
                }
              };
              rp(snippet_options).then(function (body) {
                let result = JSON.parse(body);
                if (result['StatusCode'] === '200') {
                  rtm.sendMessage(result['Message'], message['channel']);
                }
              })
            }
          }).catch(function (err) {
            console.log(err);
          });
        } else {
          rtm.sendMessage("Unknown error!", message['channel']);
        }
      });
    } else if (messageText['text'] === "history") {
      let timestamp = parseInt(messageText['ts'].split('.')[0]);
      let member_list;
      if (is_channel) {
        member_list = chan['members'];
      } else {
        member_list = [messageText['user']]
      }
      for (const userId of member_list) {
        getUserId(userId).then(user_id => {
          if (user_id > -1) {
            const options = {
              method: 'GET',
              uri: host + '/moods',
              qs: {
                'start_date': timestamp - 604800, // seconds of 7 days
                'end_date': timestamp,
                'user_id': user_id
              }
            };
            Promise.resolve(rtm.dataStore.getUserById(userId))
            .then(user => rp(options).then((json) => {
              let raw = JSON.parse(json);
              let result = "";
              for (const item of raw) {
                let theDate = new Date(parseInt(item['timestamp']) * 1000);
                result += theDate.toDateString() + " " + item['label'] + " "
                    + item['value'] + "\n";
              }
              rtm.sendMessage("*" + user.profile['real_name'] + "*",
                  message['channel']);
              if (result.length > 0) {
                rtm.sendMessage(result, message['channel']);
              } else {
                rtm.sendMessage("No mood found!", message['channel']);
              }
            }).catch((err) => console.error(err)));
          } else {
            if (can_answer) {
              rtm.sendMessage("Sorry, I could not find your moods!",
                  message['channel']);
            }
          }
        });
      }
    } else if (messageText['text'] === 'whoami') {
      let user = rtm.dataStore.getUserById(messageText['user']);
      rtm.sendMessage(user.profile['real_name'], message['channel']);
    } else if (messageText['text'] === 'echo') {
      let timestamp = parseInt(messageText['ts'].split('.')[0]);
      let member_list;
      if (is_channel) {
        member_list = chan['members'];
      } else {
        member_list = [messageText['user']]
      }
      for (const userId of member_list) {
        getUserId(userId).then(user_id => {
          if (user_id > -1) {
            const options = {
              method: 'GET',
              uri: host + '/average',
              qs: {
                'start_date': timestamp - 604800, // seconds of 7 days
                'end_date': timestamp,
                'user_id': user_id
              }
            };
            Promise.resolve(rtm.dataStore.getUserById(userId))
            .then(user => rp(options).then((json) => {
              let raw = JSON.parse(json);
              let result = "";
              for (const item of raw) {
                if (typeof(item) === 'object' && 'average' in item) {
                  result = item['average'].toString();
                }
              }
              if (result.length > 0) {
                rtm.sendMessage("In the past week, the average mood score of *"
                    + user.profile['real_name'] + "* is " + result,
                    message['channel']);
              } else {
                rtm.sendMessage("No mood found!", message['channel']);
              }
            }).catch((err) => console.error(err)));
          } else {
            if (can_answer) {
              rtm.sendMessage("User does not exist!", message['channel']);
            }
          }
        });
      }
    } else if (messageText['text'] === 'quotes') {
      let timestamp = parseInt(messageText['ts'].split('.')[0]);
      let member_list;
      if (is_channel) {
        member_list = chan['members'];
      } else {
        member_list = [messageText['user']]
      }
      for (const userId of member_list) {
        getUserId(userId).then(user_id => {
          if (user_id > -1) {
            const options = {
              method: 'GET',
              uri: host + '/snippets',
              qs: {
                'start_date': timestamp - 604800, // seconds of 7 days
                'end_date': timestamp,
                'user_id': user_id
              }
            };
            Promise.resolve(rtm.dataStore.getUserById(userId))
            .then(user => rp(options).then((json) => {
              let raw = JSON.parse(json);
              let result = "Quotes: \n";
              for (const item of raw) {
                result += "> " + item['content'] + " - " + user.profile['first_name'] + "\n";
              }
              if (result.length > 0) {
                rtm.sendMessage(result, message['channel']);
              } else {
                rtm.sendMessage("No snippet found!", message['channel']);
              }
            }).catch((err) => console.error(err)));
          } else {
            if (can_answer) {
              rtm.sendMessage("Sorry, I could not find your snippets!",
                  message['channel']);
            }
          }
        });
      }
    } else if (messageText['text'] === 'help') {
      rtm.sendMessage("*command list*\n" +
          "> echo `get the average mood from the past week` \n" +
          "> history `get the mood from the past week` \n" +
          "> feel [emoji] [value(1-6)] (\"[snippet]\") `tell the bot how you feel now`\n" +
          "> quotes `get the snippets from the past week` \n" +
          "> help `get help info`\n" +
          "```1 (depressed), 2 (sad), 3 (unhappy), 4 (satisfied), 5 (joyful), 6 (exuberant)```"
          , message['channel']);
    } else {
      if (can_answer) {
        rtm.sendMessage(
            'Sorry, I do not understand you. Please type `help` for help',
            message['channel']);
      }
    }
  } else {
    if (can_answer) {
      rtm.sendMessage(
          'Sorry, I do not understand you. Please type `help` for help',
          message['channel']);
    }
  }
});

rtm.start();
