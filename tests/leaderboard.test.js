const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const {
  getPeriodStart,
  getTopMembers,
  getTopChannels,
  getActivity,
} = require("../utils/leaderboard");

const NOW = new Date("2026-10-08T10:00:00Z");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

function addMessages(db, day, channel, user, messages, guild = "g") {
  db.prepare(
    "INSERT INTO message_daily (guild, day, channel, user, messages) VALUES (?, ?, ?, ?, ?)",
  ).run(guild, day, channel, user, messages);
}

function addMinutes(db, day, user, minutes, guild = "g") {
  db.prepare(
    "INSERT INTO voice_daily (guild, day, user, minutes) VALUES (?, ?, ?, ?)",
  ).run(guild, day, user, minutes);
}

test("getPeriodStart has no start for the global period", () => {
  assert.equal(getPeriodStart("global", NOW), null);
});

test("getPeriodStart starts the month on the first, Paris time", () => {
  assert.equal(getPeriodStart("month", NOW), "2026-10-01");
  assert.equal(
    getPeriodStart("month", new Date("2026-09-30T22:30:00Z")),
    "2026-10-01",
  );
});

test("getPeriodStart starts the week on Monday, Paris time", () => {
  assert.equal(getPeriodStart("week", NOW), "2026-10-05");
  assert.equal(
    getPeriodStart("week", new Date("2026-10-05T10:00:00Z")),
    "2026-10-05",
  );
  assert.equal(
    getPeriodStart("week", new Date("2026-10-11T10:00:00Z")),
    "2026-10-05",
  );
  assert.equal(
    getPeriodStart("week", new Date("2026-10-11T22:30:00Z")),
    "2026-10-12",
  );
});

test("getPeriodStart rejects an unknown period", () => {
  assert.throws(() => getPeriodStart("year", NOW), RangeError);
});

test("getTopMembers ranks members by messages", () => {
  const db = createDatabase();
  addMessages(db, "2026-10-08", "c", "a", 5);
  addMessages(db, "2026-10-08", "d", "a", 4);
  addMessages(db, "2026-10-07", "c", "b", 20);
  addMessages(db, "2026-10-08", "c", "c", 1);

  assert.deepEqual(getTopMembers(db, "g", "messages", "global", NOW), [
    { user: "b", value: 20 },
    { user: "a", value: 9 },
    { user: "c", value: 1 },
  ]);
});

test("getTopMembers ranks members by voice minutes", () => {
  const db = createDatabase();
  addMinutes(db, "2026-10-08", "a", 30);
  addMinutes(db, "2026-10-07", "a", 15);
  addMinutes(db, "2026-10-08", "b", 60);

  assert.deepEqual(getTopMembers(db, "g", "voice", "global", NOW), [
    { user: "b", value: 60 },
    { user: "a", value: 45 },
  ]);
});

test("getTopMembers only counts the requested period", () => {
  const db = createDatabase();
  addMessages(db, "2026-09-30", "c", "a", 100);
  addMessages(db, "2026-10-01", "c", "a", 3);
  addMessages(db, "2026-10-04", "c", "b", 50);
  addMessages(db, "2026-10-05", "c", "b", 2);

  assert.deepEqual(getTopMembers(db, "g", "messages", "month", NOW), [
    { user: "b", value: 52 },
    { user: "a", value: 3 },
  ]);
  assert.deepEqual(getTopMembers(db, "g", "messages", "week", NOW), [
    { user: "b", value: 2 },
  ]);
  assert.equal(getTopMembers(db, "g", "messages", "global", NOW)[0].value, 103);
});

test("getTopMembers limits the list and breaks ties by user", () => {
  const db = createDatabase();
  for (const user of ["d", "c", "b", "a"])
    addMessages(db, "2026-10-08", "c", user, 5);

  assert.deepEqual(getTopMembers(db, "g", "messages", "global", NOW, 3), [
    { user: "a", value: 5 },
    { user: "b", value: 5 },
    { user: "c", value: 5 },
  ]);
});

test("getTopMembers defaults to ten members and ignores other guilds", () => {
  const db = createDatabase();
  for (let index = 1; index <= 12; index++)
    addMessages(
      db,
      "2026-10-08",
      "c",
      `u${String(index).padStart(2, "0")}`,
      index,
    );
  addMessages(db, "2026-10-08", "c", "stranger", 999, "other");

  const top = getTopMembers(db, "g", "messages", "global", NOW);

  assert.equal(top.length, 10);
  assert.equal(top[0].user, "u12");
  assert.ok(top.every((row) => row.user !== "stranger"));
});

test("getTopMembers is empty without data and rejects an unknown type", () => {
  const db = createDatabase();
  assert.deepEqual(getTopMembers(db, "g", "messages", "global", NOW), []);
  assert.throws(() => getTopMembers(db, "g", "xp", "global", NOW), RangeError);
});

test("getTopChannels ranks channels by messages over the period", () => {
  const db = createDatabase();
  addMessages(db, "2026-10-08", "general", "a", 10);
  addMessages(db, "2026-10-08", "general", "b", 5);
  addMessages(db, "2026-10-07", "memes", "a", 20);
  addMessages(db, "2026-09-01", "old", "a", 500);
  addMessages(db, "2026-10-08", "elsewhere", "a", 500, "other");

  assert.deepEqual(getTopChannels(db, "g", "month", NOW), [
    { channel: "memes", value: 20 },
    { channel: "general", value: 15 },
  ]);
  assert.equal(getTopChannels(db, "g", "global", NOW)[0].channel, "old");
  assert.equal(getTopChannels(db, "g", "global", NOW, 1).length, 1);
});

test("getActivity covers the current week for the week period, future days empty", () => {
  const db = createDatabase();
  addMessages(db, "2026-10-08", "c", "a", 5);
  addMessages(db, "2026-10-08", "d", "b", 2);
  addMessages(db, "2026-10-05", "c", "a", 3);
  addMessages(db, "2026-10-04", "c", "a", 99);

  assert.deepEqual(getActivity(db, "g", "messages", "week", NOW), [
    { day: "2026-10-05", value: 3 },
    { day: "2026-10-06", value: 0 },
    { day: "2026-10-07", value: 0 },
    { day: "2026-10-08", value: 7 },
    { day: "2026-10-09", value: 0 },
    { day: "2026-10-10", value: 0 },
    { day: "2026-10-11", value: 0 },
  ]);
});

test("getActivity sums the last four weeks, labelled by their Monday, for the month period", () => {
  const db = createDatabase();
  addMessages(db, "2026-09-14", "c", "a", 1);
  addMessages(db, "2026-09-15", "c", "a", 10);
  addMessages(db, "2026-09-28", "c", "a", 4);
  addMessages(db, "2026-10-04", "c", "b", 6);
  addMessages(db, "2026-10-08", "c", "a", 5);
  addMessages(db, "2026-09-13", "c", "a", 99);

  assert.deepEqual(getActivity(db, "g", "messages", "month", NOW), [
    { day: "2026-09-14", value: 11 },
    { day: "2026-09-21", value: 0 },
    { day: "2026-09-28", value: 10 },
    { day: "2026-10-05", value: 5 },
  ]);
});

test("getActivity sums the last six months for the global period", () => {
  const db = createDatabase();
  addMessages(db, "2026-05-31", "c", "a", 99);
  addMessages(db, "2026-06-01", "c", "a", 2);
  addMessages(db, "2026-06-30", "c", "b", 3);
  addMessages(db, "2026-09-15", "c", "a", 7);
  addMessages(db, "2026-10-08", "c", "a", 4);

  assert.deepEqual(getActivity(db, "g", "messages", "global", NOW), [
    { day: "2026-05-01", value: 99 },
    { day: "2026-06-01", value: 5 },
    { day: "2026-07-01", value: 0 },
    { day: "2026-08-01", value: 0 },
    { day: "2026-09-01", value: 7 },
    { day: "2026-10-01", value: 4 },
  ]);
});

test("getActivity covers voice minutes and year boundaries", () => {
  const db = createDatabase();
  addMinutes(db, "2026-12-30", "a", 12);
  addMinutes(db, "2027-01-02", "b", 8);
  addMinutes(db, "2027-01-02", "a", 2);

  const activity = getActivity(
    db,
    "g",
    "voice",
    "global",
    new Date("2027-01-10T10:00:00Z"),
  );

  assert.equal(activity.length, 6);
  assert.equal(activity[0].day, "2026-08-01");
  assert.equal(activity[4].value, 12);
  assert.equal(activity[5].value, 10);
});

test("getActivity rejects an unknown period", () => {
  assert.throws(
    () => getActivity(createDatabase(), "g", "messages", "year", NOW),
    RangeError,
  );
});
