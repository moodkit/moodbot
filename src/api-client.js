'use strict';
const rp = require('request-promise');
const host = process.env.HOST;

/**
 * Given a timestamp in seconds,
 * returns the timestamp corresponding to the start of the day
 * @param timestamp
 * @returns {number}
 */
function _toStartOfDay(timestamp) {
  // TODO if more date manipulation is needed, consider using moment.js
  const A_DAY_IN_SECONDS = 86400;
  return Math.floor(timestamp / A_DAY_IN_SECONDS) * A_DAY_IN_SECONDS;
}

module.exports = {
  fetchAllUsers() {
    return rp({
      method: 'GET',
      uri: host + '/users',
      json: true
    });
  },
  fetchUsersBySlackId(slackUserId) {
    return rp({
      method: 'GET',
      uri: host + '/users',
      qs: { slug: slackUserId },
      json: true
    });
  },
  createUser(slackUserId, name, email) {
    return rp({
      method: 'POST',
      uri: host + '/users',
      form: {
        slug: slackUserId,
        name: name,
        email: email
      }
    });
  },
  createMood(moodUserId, timestamp, label, value) {
    return rp({
      method: 'POST',
      uri: host + '/moods',
      form: {
        timestamp: _toStartOfDay(timestamp),
        label: label,
        value: value,
        user_id: moodUserId
      }
    });
  },
  createSnippet(moodUserId, timestamp, content) {
    return rp({
      method: 'POST',
      uri: host + '/snippets',
      form: {
        timestamp: _toStartOfDay(timestamp),
        content: content,
        user_id: moodUserId
      }
    });
  },
  fetchMoods(moodUserId, start, end) {
    return rp({
      method: 'GET',
      uri: host + '/moods',
      json: true,
      qs: {
        'start_date': start,
        'end_date': end,
        'user_id': moodUserId
      }
    });
  },
  fetchAverages(moodUserId, start, end) {
    return rp({
      method: 'GET',
      uri: host + '/average',
      json: true,
      qs: {
        'start_date': start,
        'end_date': end,
        'user_id': moodUserId
      }
    });
  },
  fetchSnippets(moodUserId, start, end) {
    return rp({
      method: 'GET',
      uri: host + '/snippets',
      json: true,
      qs: {
        'start_date': start,
        'end_date': end,
        'user_id': moodUserId
      }
    });
  },
};
