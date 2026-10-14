const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const {
  removalLogMessage,
  sendRemovalLog,
} = require("../../utils/moderation/warnRemovalLog");

function content(message) {
  return message.components[0].toJSON().components[0].content;
}

function channel(sent = [], { fails = false, textBased = true } = {}) {
  return {
    isTextBased: () => textBased,
    send: async (message) => {
      if (fails) throw new Error("missing access");
      sent.push(message);
    },
  };
}

function guild(logChannel) {
  return { channels: { cache: new Map([["log", logChannel]]) } };
}

const DATA = { moderatorId: "mod", userId: "u", ids: ["WARN-1", "WARN-2"] };

test("removalLogMessage names the moderator, the member and the IDs", () => {
  const message = removalLogMessage(DATA);
  assert.equal(message.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(message.allowedMentions, { parse: [] });
  assert.equal(
    content(message),
    "## Avertissements retirés\n<@mod> a retiré 2 avertissements de <@u>.\n-# WARN-1, WARN-2 · modérateur mod · membre u",
  );
});

test("removalLogMessage uses the singular for one warning", () => {
  const text = content(removalLogMessage({ ...DATA, ids: ["WARN-1"] }));
  assert.match(text, /^## Avertissement retiré\n/);
  assert.match(text, /a retiré 1 avertissement de/);
});

test("removalLogMessage says purged for a purge", () => {
  const text = content(removalLogMessage({ ...DATA, purge: true }));
  assert.match(text, /^## Avertissements purgés\n/);
  assert.match(text, /a purgé 2 avertissements de/);
});

test("sendRemovalLog posts in the log channel", async () => {
  const sent = [];
  assert.equal(await sendRemovalLog(guild(channel(sent)), "log", DATA), true);
  assert.equal(sent.length, 1);
});

test("sendRemovalLog does nothing without a log channel or warnings", async () => {
  const sent = [];
  assert.equal(await sendRemovalLog(guild(channel(sent)), null, DATA), false);
  assert.equal(
    await sendRemovalLog(guild(channel(sent)), "log", { ...DATA, ids: [] }),
    false,
  );
  assert.equal(sent.length, 0);
});

test("sendRemovalLog ignores a missing or unusable channel", async () => {
  assert.equal(await sendRemovalLog(guild(channel()), "other", DATA), false);
  assert.equal(
    await sendRemovalLog(guild(channel([], { textBased: false })), "log", DATA),
    false,
  );
  assert.equal(
    await sendRemovalLog(guild(channel([], { fails: true })), "log", DATA),
    false,
  );
});
