const MIN_LENGTH = 5;
const CONVERSATION_WINDOW = 2 * 60 * 1000;
const CONVERSATION_BONUS = 1.25;
const PRUNE_EVERY = 10 * 60 * 1000;
const PRUNE_AGE = 2 * 60 * 60 * 1000;

const NOISE = [
  /<a?:\w+:\d+>/g,
  /<(?:@[!&]?|#)\d+>/g,
  /https?:\/\/\S+/g,
  /[^\p{L}\p{N}]/gu,
];

function meaningfulText(content) {
  return NOISE.reduce(
    (text, pattern) => text.replace(pattern, ""),
    content.toLowerCase(),
  );
}

function createMessageXpTracker() {
  const members = new Map();
  const channels = new Map();
  let lastPrune = 0;

  function prune(now) {
    for (const [key, member] of members)
      if (now - member.lastSeen > PRUNE_AGE) members.delete(key);

    for (const [channelId, authors] of channels) {
      for (const [authorId, time] of authors)
        if (now - time > CONVERSATION_WINDOW) authors.delete(authorId);
      if (authors.size === 0) channels.delete(channelId);
    }
  }

  function joinsConversation(channelId, authorId, now) {
    const authors = channels.get(channelId) ?? new Map();
    channels.set(channelId, authors);

    const othersActive = [...authors].some(
      ([id, time]) => id !== authorId && now - time <= CONVERSATION_WINDOW,
    );
    authors.set(authorId, now);
    return othersActive;
  }

  function evaluate(message, cooldown) {
    const {
      guildId,
      channelId,
      authorId,
      content,
      repliesTo,
      now = Date.now(),
    } = message;

    if (now - lastPrune > PRUNE_EVERY) {
      prune(now);
      lastPrune = now;
    }

    const conversation =
      joinsConversation(channelId, authorId, now) ||
      (repliesTo !== null && repliesTo !== authorId);

    const text = meaningfulText(content);
    if ([...text].length < MIN_LENGTH)
      return { eligible: false, reason: "short" };

    const key = `${guildId}:${authorId}`;
    const member = members.get(key) ?? { lastGain: -Infinity, lastText: null };
    members.set(key, member);

    const repeated = text === member.lastText;
    member.lastText = text;
    member.lastSeen = now;
    if (repeated) return { eligible: false, reason: "repeated" };

    if (now - member.lastGain < cooldown * 1000)
      return { eligible: false, reason: "cooldown" };

    member.lastGain = now;
    return {
      eligible: true,
      multiplier: conversation ? CONVERSATION_BONUS : 1,
    };
  }

  return { evaluate, size: () => members.size + channels.size };
}

module.exports = { meaningfulText, createMessageXpTracker };
