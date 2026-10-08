const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { addMessage } = require("../utils/messageCount");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function rows(db) {
  return db
    .prepare(
      "SELECT guild, day, channel, user, messages FROM message_daily ORDER BY guild, day, channel, user",
    )
    .all()
    .map((row) => ({ ...row }));
}

test("addMessage counts one message per call", () => {
  const db = createDatabase();
  const date = new Date("2026-10-08T10:00:00Z");

  addMessage(db, "g", "c", "a", date);
  addMessage(db, "g", "c", "a", date);

  assert.deepEqual(rows(db), [
    { guild: "g", day: "2026-10-08", channel: "c", user: "a", messages: 2 },
  ]);
});

test("addMessage keeps members, channels, days and guilds apart", () => {
  const db = createDatabase();
  const date = new Date("2026-10-08T10:00:00Z");

  addMessage(db, "g", "c", "a", date);
  addMessage(db, "g", "c", "b", date);
  addMessage(db, "g", "d", "a", date);
  addMessage(db, "g", "c", "a", new Date("2026-10-09T10:00:00Z"));
  addMessage(db, "other", "c", "a", date);

  assert.equal(rows(db).length, 5);
  assert.ok(rows(db).every((row) => row.messages === 1));
});

test("addMessage uses the Paris day", () => {
  const db = createDatabase();

  addMessage(db, "g", "c", "a", new Date("2026-10-03T22:30:00Z"));

  assert.equal(rows(db)[0].day, "2026-10-04");
});

test("the database rejects a negative message count", () => {
  const db = createDatabase();
  assert.throws(() =>
    db
      .prepare(
        "INSERT INTO message_daily (guild, day, channel, user, messages) VALUES ('g', '2026-10-08', 'c', 'a', -1)",
      )
      .run(),
  );
});
