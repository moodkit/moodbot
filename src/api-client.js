const rp = require('request-promise-native');

const host = process.env.HOST;

/**
 * Given a timestamp in seconds,
 * returns the timestamp corresponding to the start of the day
 * @param timestamp
 * @returns {number}
 */
function toStartOfDay(timestamp) {
  const A_DAY_IN_SECONDS = 86400;
  return Math.floor(timestamp / A_DAY_IN_SECONDS) * A_DAY_IN_SECONDS;
}

module.exports = {
  fetchAllUsers() {
    return rp({
      method: 'GET',
      uri: `${host}/users`,
      json: true,
    });
  },
  fetchUsersBySlackId(slackUserId) {
    return rp({
      method: 'GET',
      uri: `${host}/users`,
      qs: { slug: slackUserId },
      json: true,
    });
  },
  createUser(slackUserId, name, email) {
    return rp({
      method: 'POST',
      uri: `${host}/users`,
      form: {
        slug: slackUserId,
        name,
        email,
      },
      json: true,
    });
  },
  createMood(moodUserId, timestamp, label, value) {
    return rp({
      method: 'POST',
      uri: `${host}/moods`,
      form: {
        timestamp: toStartOfDay(timestamp),
        label,
        value,
        user_id: moodUserId,
      },
      json: true,
    });
  },
  createSnippet(moodUserId, timestamp, content) {
    return rp({
      method: 'POST',
      uri: `${host}/snippets`,
      form: {
        timestamp: toStartOfDay(timestamp),
        content,
        user_id: moodUserId,
      },
      json: true,
    });
  },
  fetchMoods(moodUserId, start, end) {
    return rp({
      method: 'GET',
      uri: `${host}/moods`,
      qs: {
        start_date: start,
        end_date: end,
        user_id: moodUserId,
      },
      json: true,
    });
  },
  fetchAverages(moodUserId, start, end) {
    return rp({
      method: 'GET',
      uri: `${host}/average`,
      qs: {
        start_date: start,
        end_date: end,
        user_id: moodUserId,
      },
      json: true,
    });
  },
  fetchSnippets(moodUserId, start, end) {
    return rp({
      method: 'GET',
      uri: `${host}/snippets`,
      qs: {
        start_date: start,
        end_date: end,
        user_id: moodUserId,
      },
      json: true,
    });
  },
};
