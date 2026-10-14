const pending = new Map();

function oncePerGuild(kind, guildId, task) {
  const key = `${kind}:${guildId}`;
  const running = pending.get(key);
  if (running) return running;
  const promise = Promise.resolve()
    .then(task)
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}

module.exports = { oncePerGuild };
