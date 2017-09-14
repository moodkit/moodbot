const _ = require('lodash');
const stringTable = require('string-table');
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
const RTM_EVENTS = require('@slack/client').RTM_EVENTS;
const RtmClient = require('@slack/client').RtmClient;
const moodApi = require('./api-client');

const botToken = process.env.SLACK_BOT_TOKEN;
const rtm = new RtmClient(botToken);

let botId;

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  botId = rtmStartData.self.id;
  console.log(
    `Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
  console.log('Now you can start talking!');
});

const A_WEEK_IN_SECONDS = 604800;

function isEmoji(str) {
  return /^:[\w-+]+:$/.test(str);
}
function isMoodValue(str) {
  return /^[1-6]$/.test(str);
}

/**
 * Given the slack user id, retrieves the user id used by the mood API.
 * Unknown users are created on the fly.
 * @param slackUserId
 * @returns {Promise.<TResult>}
 */
function promiseGetUserId(slackUserId) {
  return moodApi.fetchUsersBySlackId(slackUserId)
    .then((users) => {
      if (users.length > 0) {
        return users;
      }

      // Not found --> silently create the user and retry
      const slackUser = rtm.dataStore.getUserById(slackUserId);
      console.log('Creating user for:', slackUser.profile.email);
      return moodApi.createUser(slackUserId, slackUser.real_name, slackUser.profile.email)
        .then(() => moodApi.fetchUsersBySlackId(slackUserId));
    })
    .then(users => users[0].id);
}

function getChannelHumanMembers(message) {
  const channelInfo = rtm.dataStore.getChannelGroupOrDMById(message.channel);

  if (!channelInfo.members) { // happens in a direct message
    return [rtm.dataStore.getUserById(message.user)];
  }

  return channelInfo.members
    .map(memberId => rtm.dataStore.getUserById(memberId))
    .filter(slackUser => slackUser && slackUser.id !== botId && !slackUser.is_bot);
}

function isInPublicChannel(message) {
  const channelInfo = rtm.dataStore.getChannelGroupOrDMById(message.channel);
  return channelInfo.is_channel;
}

function isMoodBotMentioned(message) {
  return message.text && message.text.indexOf(`<@${botId}>`) >= 0;
}

function getTimestampInSeconds(message) {
  return parseInt(message.ts.split('.')[0], 10);
}

/** Handles a message anywhere, reacts on special commands.
 *
 * Base message structure:
 * {
 *    "type": "message",
 *    "channel": "C2147483705",
 *    "user": "U2147483697",
 *    "text": "Hello world",
 *    "ts": "1355517523.000005"
 * }
 *
 * Changed message structure:
 * {
 *     "type": "message",
 *     "subtype": "message_changed",
 *     "hidden": true,
 *     "channel": "C2147483705",
 *     "ts": "1358878755.000001",
 *     "message": {
 *         "type": "message",
 *         "user": "U2147483697",
 *         "text": "Hello, world!",
 *         "ts": "1355517523.000005",
 *         "edited": {
 *             "user": "U2147483697",
 *             "ts": "1358878755.000001"
 *         }
 *     }
 * }
 */
rtm.on(RTM_EVENTS.MESSAGE, (message) => {
  if (!message || message.error) {
    return;
  }

  // convert a message_changed payload to look like a normal message
  if (message.subtype === 'message_changed') {
    message = { // eslint-disable-line no-param-reassign
      type: message.type,
      channel: message.channel,
      user: message.message.user,
      text: message.message.text,
      ts: message.message.ts, // this will be the original timestamp
    };
  } else if (message.subtype) {
    return; // other subtypes are not handled
  }

  if (message.user === botId) {
    // good bots should not talk to themselves
    return;
  }

  // moodbot is shy
  const shouldReportErrors = isMoodBotMentioned(message) || !isInPublicChannel(message);

  if (message.text.toLowerCase() === 'users') {
    moodApi.fetchAllUsers()
      .then((users) => {
        rtm.sendMessage(`\`\`\`${stringTable.create(users)}\`\`\``, message.channel);
      })
      .catch(err => console.error('Error while performing the "users" command:', err));
  } else if (message.text.toLowerCase() === 'history') {
    rtm.sendMessage('History: \n', message.channel);
    const timestamp = getTimestampInSeconds(message);
    const channelMembers = getChannelHumanMembers(message);

    for (const slackUser of channelMembers) {
      promiseGetUserId(slackUser.id)
        .then(userId => moodApi.fetchMoods(userId, timestamp - A_WEEK_IN_SECONDS, timestamp))
        .then((moods) => {
          let result = '';
          for (const mood of moods) {
            const theDate = new Date(parseInt(mood.timestamp, 10) * 1000);
            result += `${theDate.toDateString()} ${mood.label} ${mood.value}\n`;
          }
          rtm.sendMessage(`*${slackUser.profile.real_name}*`,
            message.channel);
          if (result.length > 0) {
            rtm.sendMessage(result, message.channel);
          } else {
            rtm.sendMessage('No mood found!', message.channel);
          }
        })
        .catch(err => console.error('Error while performing the "history" command:', err));
    }
  } else if (message.text.toLowerCase() === 'whoami') {
    const slackUser = rtm.dataStore.getUserById(message.user);
    rtm.sendMessage(slackUser.profile.real_name, message.channel);
  } else if (message.text.toLowerCase() === 'hello' ||
      (message.text.toLowerCase().startsWith('hello') && isMoodBotMentioned(message))) {
    const slackUser = rtm.dataStore.getUserById(message.user);
    const greeting = `Oh, hi ${slackUser.profile.first_name}!`;
    const botMoodMessage = _.sample([
      'I feel like an amazing unicorn! How do you `feel`?',
      'What a great day! How do you `feel`?',
      'Everything as usual, parsing your messages makes me already happy. How do you `feel`?',
      'Thank you for saying `hello`! I am a happy bot now. What about you?',
      'I feel helpful, how can I `help` you?',

      'People like you seem to like funny random answers. Say `hello` to me more often!',
      'It\'s meee, moodbot!',
      'Don\'t worry, be happy now! (just type `feel :happy: 4 moodbot told me not to worry`)',
      'You know you are talking to a bot. Are you ok? How do you feel today?',
      'Forget what I might have said before. Feeling much better now. How about you?',
      'Forget what I might have said before. Feeling much worse now. How about you?',

      'The life of a slack bot is not so exciting. What about yours?',
      'I feel like I have no feelings. How do you `feel` about having feelings?',
      'I feel used. At least use me for something meaningful. How? type `help` to know.',
      'I\'m not having a great day. I don\'t want to talk about it. Let\'s talk about you instead.',
      'What a great day to annoy a *VERY BUSY* moodbot. What do you want, human?',
      'Not you again! Just type a command and leave me be!',
    ]);
    rtm.sendMessage(`${greeting}\n${botMoodMessage}`, message.channel);
  } else if (message.text.toLowerCase() === 'echo') {
    rtm.sendMessage('Last week\'s average mood scores: \n', message.channel);
    const timestamp = getTimestampInSeconds(message);
    const channelMembers = getChannelHumanMembers(message);

    for (const slackUser of channelMembers) {
      promiseGetUserId(slackUser.id)
        .then(userId => moodApi.fetchAverages(userId, timestamp - A_WEEK_IN_SECONDS, timestamp))
        .then((averages) => {
          let result = '';
          // TODO why is this not a simple number? looks like an array of objects of which one will have a 'average' property
          for (const averageItem of averages) {
            if (typeof averageItem === 'object' && 'average' in averageItem) {
              result = averageItem.average.toString();
              break;
            }
          }
          if (result.length > 0) {
            rtm.sendMessage(`*${slackUser.profile.real_name}* : ${result}`, message.channel);
          } else {
            rtm.sendMessage('No mood found!', message.channel);
          }
        })
        .catch(err => console.error('Error while performing the "echo" command:', err));
    }
  } else if (message.text.toLowerCase() === 'quotes') {
    rtm.sendMessage('Quotes: \n', message.channel);
    const timestamp = getTimestampInSeconds(message);
    const channelMembers = getChannelHumanMembers(message);

    // for each member of the channel, retrieve snippets of the last week and report them
    for (const slackUser of channelMembers) {
      promiseGetUserId(slackUser.id)
        .then(userId => moodApi.fetchSnippets(userId, timestamp - A_WEEK_IN_SECONDS, timestamp))
        .then((snippets) => {
          let result = '';
          for (const snippet of snippets) {
            result += `> ${snippet.content} *- ${slackUser.profile.first_name}*\n`;
          }
          if (result.length > 0) {
            rtm.sendMessage(result, message.channel);
          }
        })
        .catch(err => console.error('Error while performing the "quotes" command:', err));
    }
  } else if (message.text.toLowerCase() === 'help') {
    rtm.sendMessage('*command list*\n' +
        '> feel/felt [emoji] [1-6] ([snippet]) `tell the bot how you feel/felt now, snippet is optional`\n' +
        '> echo `get the average mood from the past week` \n' +
        '> history `get the mood from the past week` \n' +
        '> quotes `get the snippets from the past week` \n' +
        '> hello `say hi to me and i will tell you how i feel` \n' +
        '> help `get help info`\n' +
        '```1 (depressed), 2 (sad), 3 (unhappy), 4 (satisfied), 5 (joyful), 6 (exuberant)```'
      , message.channel);
  } else if (message.text.substr(0, 4).toLowerCase() === 'feel' || message.text.substr(0, 4).toLowerCase() === 'felt') {
    const command = message.text.substr(0, 4).toLowerCase();
    let timestamp = getTimestampInSeconds(message);
    if (command === 'felt') {
      timestamp -= 86400;
    }
    const [, firstArg, secondArg, ...rest] = message.text.split(' ');
    const snippet = rest && rest.join(' ');

    let emoji;
    let value;

    // if the emoji and value are swapped, fixes it for you
    if (isEmoji(firstArg) && isMoodValue(secondArg)) {
      emoji = firstArg;
      value = parseInt(secondArg, 10);
    } else if (isMoodValue(firstArg) && isEmoji(secondArg)) {
      value = parseInt(firstArg, 10);
      emoji = secondArg;
    } else {
      rtm.sendMessage('Sorry, I do not understand you. The "' + command + '" command syntax is:\n' +
        '`' + command + ' [emoji] [1-6] ([snippet])`\n' +
        'For more help, please type `help`', message.channel);
      return;
    }

    promiseGetUserId(message.user)
      .then(userId => moodApi.createMood(userId, timestamp, emoji, value)
        .then((response) => {
          if (response.StatusCode === '200') {
            rtm.sendMessage(response.Message, message.channel);
          } else {
            if (command === 'feel') {
              rtm.sendMessage(
                  'We have your mood today. Reach out to me tomorrow.',
                  message.channel);
            } else {
              rtm.sendMessage(
                  'We have your mood yesterday.',
                  message.channel);
            }
          }
        })
        .then(() => !snippet || moodApi.createSnippet(userId, timestamp, snippet)
          .then((response) => {
            if (response.StatusCode === '200') {
              rtm.sendMessage(response.Message, message.channel);
            } else {
              console.error('Error while saving snippet', response);
            }
          })
        )
      )
      .catch(err => console.error('Error while performing the "' + command + '" command:', err));
  } else if (shouldReportErrors) {
    // none of the commands matched
    rtm.sendMessage('Sorry, I do not understand you. Please type `help` for help', message.channel);
  }
});

rtm.start();
