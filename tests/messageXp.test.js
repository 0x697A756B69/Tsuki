const test = require("node:test");
const assert = require("node:assert/strict");
const {
  meaningfulText,
  createMessageXpTracker,
} = require("../utils/messageXp");

const MINUTE = 60 * 1000;

function send(
  tracker,
  content,
  { author = "a", channel = "c", repliesTo = null, at = 0 } = {},
) {
  return tracker.evaluate(
    {
      guildId: "g",
      channelId: channel,
      authorId: author,
      content,
      repliesTo,
      now: at,
    },
    60,
  );
}

test("meaningfulText keeps only letters and numbers", () => {
  assert.equal(
    meaningfulText("Salut <@123> 😂 <:pog:456> https://x.com <#789> ça va"),
    "salutçava",
  );
});

test("short or empty messages give no XP", () => {
  const tracker = createMessageXpTracker();
  for (const content of [
    "ok",
    "😂😂😂😂😂",
    "!!!!!!",
    "<@123> <:pog:456>",
    "https://example.com",
  ])
    assert.equal(send(tracker, content).reason, "short");
});

test("a real message gives XP", () => {
  assert.deepEqual(send(createMessageXpTracker(), "salut tout le monde"), {
    eligible: true,
    multiplier: 1,
  });
});

test("the cooldown limits XP to one gain per minute", () => {
  const tracker = createMessageXpTracker();
  send(tracker, "premier message", { at: 0 });

  assert.equal(
    send(tracker, "deuxième message", { at: 30 * 1000 }).reason,
    "cooldown",
  );
  assert.equal(
    send(tracker, "troisième message", { at: MINUTE }).eligible,
    true,
  );
});

test("repeating the same message gives no XP", () => {
  const tracker = createMessageXpTracker();
  send(tracker, "Achetez mon serveur", { at: 0 });

  assert.equal(
    send(tracker, "achetez  MON serveur !", { at: 2 * MINUTE }).reason,
    "repeated",
  );
  assert.equal(send(tracker, "autre chose", { at: 3 * MINUTE }).eligible, true);
});

test("replying to someone else gives the conversation bonus", () => {
  const tracker = createMessageXpTracker();
  assert.equal(
    send(tracker, "je suis d'accord", { repliesTo: "b" }).multiplier,
    1.25,
  );
});

test("replying to yourself gives no bonus", () => {
  const tracker = createMessageXpTracker();
  assert.equal(
    send(tracker, "je me réponds", { repliesTo: "a" }).multiplier,
    1,
  );
});

test("talking with others in the same channel gives the bonus", () => {
  const tracker = createMessageXpTracker();
  send(tracker, "quelqu'un est là ?", { author: "b", at: 0 });

  assert.equal(
    send(tracker, "oui je suis là", { at: MINUTE }).multiplier,
    1.25,
  );
});

test("no bonus once the others have been quiet for a while", () => {
  const tracker = createMessageXpTracker();
  send(tracker, "quelqu'un est là ?", { author: "b", at: 0 });

  assert.equal(
    send(tracker, "oui je suis là", { at: 3 * MINUTE }).multiplier,
    1,
  );
});

test("old members and channels are forgotten", () => {
  const tracker = createMessageXpTracker();
  send(tracker, "un vieux message", { author: "b", channel: "old", at: 0 });
  send(tracker, "un autre message", { channel: "new", at: 3 * 60 * MINUTE });

  assert.equal(tracker.size(), 2);
});
