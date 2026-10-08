const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { addVoiceMinute } = require("../utils/voiceCount");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function rows(db) {
  return db
    .prepare(
      "SELECT guild, day, user, minutes FROM voice_daily ORDER BY guild, day, user",
    )
    .all()
    .map((row) => ({ ...row }));
}

test("addVoiceMinute counts one minute per call", () => {
  const db = createDatabase();
  const date = new Date("2026-10-08T10:00:00Z");

  addVoiceMinute(db, "g", "a", date);
  addVoiceMinute(db, "g", "a", date);

  assert.deepEqual(rows(db), [
    { guild: "g", day: "2026-10-08", user: "a", minutes: 2 },
  ]);
});

test("addVoiceMinute keeps members, days and guilds apart", () => {
  const db = createDatabase();
  const date = new Date("2026-10-08T10:00:00Z");

  addVoiceMinute(db, "g", "a", date);
  addVoiceMinute(db, "g", "b", date);
  addVoiceMinute(db, "g", "a", new Date("2026-10-09T10:00:00Z"));
  addVoiceMinute(db, "other", "a", date);

  assert.equal(rows(db).length, 4);
  assert.ok(rows(db).every((row) => row.minutes === 1));
});

test("addVoiceMinute uses the Paris day", () => {
  const db = createDatabase();

  addVoiceMinute(db, "g", "a", new Date("2026-10-03T22:30:00Z"));

  assert.equal(rows(db)[0].day, "2026-10-04");
});

test("the database rejects a negative minute count", () => {
  const db = createDatabase();
  assert.throws(() =>
    db
      .prepare(
        "INSERT INTO voice_daily (guild, day, user, minutes) VALUES ('g', '2026-10-08', 'a', -1)",
      )
      .run(),
  );
});
