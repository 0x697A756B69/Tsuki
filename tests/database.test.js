const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { createDatabase } = require("./helpers/database");
const {
  toDay,
  getTotalXp,
  addXp,
  resetXp,
  getTypeXp,
  getBreakdown,
  previewReset,
  countRanked,
  getRank,
} = require("../utils/xp");

test("migrate converts the old xp table into total XP", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE xp (guild TEXT, user TEXT, xp INTEGER, level INTEGER, PRIMARY KEY (guild, user));
    INSERT INTO xp VALUES ('g', 'a', 16, 0), ('g', 'b', 500, 2);
  `);

  migrate(db);

  const rows = db
    .prepare("SELECT user, total_xp FROM members ORDER BY user")
    .all();
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [
      { user: "a", total_xp: 16 },
      { user: "b", total_xp: 3500 },
    ],
  );
});

test("migrate only applies new migrations", () => {
  const db = createDatabase();
  assert.deepEqual(migrate(db), []);
});

test("addXp accumulates XP and reports level ups", () => {
  const db = createDatabase();

  assert.deepEqual(addXp(db, "g", "a", 60, "messages"), {
    previousLevel: 0,
    level: 0,
    previousTotal: 0,
    total: 60,
  });
  assert.deepEqual(addXp(db, "g", "a", 60, "messages"), {
    previousLevel: 0,
    level: 1,
    previousTotal: 60,
    total: 120,
  });

  const { total_xp } = db.prepare("SELECT total_xp FROM members").get();
  assert.equal(total_xp, 120);
});

test("addXp records XP per day", () => {
  const db = createDatabase();
  const day = new Date("2026-10-01T12:00:00Z");

  addXp(db, "g", "a", 10, "messages", day);
  addXp(db, "g", "a", 15, "messages", day);
  addXp(db, "g", "a", 5, "messages", new Date("2026-10-02T12:00:00Z"));

  const rows = db.prepare("SELECT day, xp FROM xp_daily ORDER BY day").all();
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [
      { day: "2026-10-01", xp: 25 },
      { day: "2026-10-02", xp: 5 },
    ],
  );
});

test("toDay uses the Paris time zone", () => {
  assert.equal(toDay(new Date("2026-10-03T22:30:00Z")), "2026-10-04");
  assert.equal(toDay(new Date("2026-12-31T22:59:00Z")), "2026-12-31");
});

test("countRanked counts members with XP in the guild", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 10, "messages");
  addXp(db, "g", "b", 10, "messages");
  addXp(db, "other", "c", 10, "messages");

  assert.equal(countRanked(db, "g"), 2);
  assert.equal(countRanked(db, "empty"), 0);
});

test("getRank gives the position among ranked members of the guild", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 300, "messages");
  addXp(db, "g", "b", 500, "messages");
  addXp(db, "g", "c", 100, "messages");
  addXp(db, "other", "d", 900, "messages");

  assert.deepEqual(getRank(db, "g", "b"), { position: 1, ranked: 3 });
  assert.deepEqual(getRank(db, "g", "a"), { position: 2, ranked: 3 });
  assert.deepEqual(getRank(db, "g", "c"), { position: 3, ranked: 3 });
});

test("getRank shares the position between tied members", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 200, "messages");
  addXp(db, "g", "b", 200, "messages");
  addXp(db, "g", "c", 50, "messages");

  assert.equal(getRank(db, "g", "a").position, 1);
  assert.equal(getRank(db, "g", "b").position, 1);
  assert.equal(getRank(db, "g", "c").position, 3);
});

test("getRank is null for members without XP", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 10, "messages");
  addXp(db, "g", "b", 10, "messages");
  addXp(db, "g", "b", -10, "manual");

  assert.equal(getRank(db, "g", "b"), null);
  assert.equal(getRank(db, "g", "nobody"), null);
  assert.equal(getRank(db, "empty", "a"), null);
});

test("addXp with a negative amount removes XP and reports the level", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 500, "messages");

  assert.deepEqual(addXp(db, "g", "a", -300, "manual"), {
    previousLevel: 3,
    level: 1,
    previousTotal: 500,
    total: 200,
  });
  assert.equal(getTotalXp(db, "g", "a"), 200);
});

test("addXp never takes a member below zero", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 50, "messages");

  const result = addXp(db, "g", "a", -500, "manual");
  assert.equal(result.total, 0);
  assert.equal(getTotalXp(db, "g", "a"), 0);
  assert.equal(addXp(db, "g", "unknown", -10, "manual").total, 0);
});

test("addXp never makes the daily XP negative", () => {
  const db = createDatabase();
  const day = new Date("2026-10-01T12:00:00Z");
  addXp(db, "g", "a", 50, "messages", new Date("2026-09-30T12:00:00Z"));
  addXp(db, "g", "a", -30, "manual", day);
  addXp(db, "g", "a", 10, "messages", day);
  addXp(db, "g", "a", -100, "manual", day);

  const rows = db.prepare("SELECT day, xp FROM xp_daily ORDER BY day").all();
  assert.ok(rows.every((row) => Number(row.xp) >= 0));
});

test("getTotalXp is 0 for an unknown member", () => {
  assert.equal(getTotalXp(createDatabase(), "g", "nobody"), 0);
});

test("resetXp wipes one member and returns the previous total", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 120, "messages");
  addXp(db, "g", "b", 40, "messages");
  addXp(db, "other", "a", 70, "messages");

  assert.equal(resetXp(db, "g", "a"), 120);
  assert.equal(getTotalXp(db, "g", "a"), 0);
  assert.equal(getTotalXp(db, "g", "b"), 40);
  assert.equal(getTotalXp(db, "other", "a"), 70);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM xp_daily WHERE guild = ? AND user = ?",
      )
      .get("g", "a").n,
    0,
  );
  assert.equal(resetXp(db, "g", "a"), 0);
});

function sourcesOf(db, user = "a") {
  const row = db
    .prepare(
      "SELECT total_xp, message_xp, voice_xp, manual_xp FROM members WHERE guild = 'g' AND user = ?",
    )
    .get(user);
  return { ...row };
}

test("migrate moves the existing totals into message XP", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE xp (guild TEXT, user TEXT, xp INTEGER, level INTEGER, PRIMARY KEY (guild, user));
    INSERT INTO xp VALUES ('g', 'a', 16, 0), ('g', 'b', 500, 2);
  `);

  migrate(db);

  const rows = db
    .prepare(
      "SELECT user, total_xp, message_xp, voice_xp, manual_xp FROM members ORDER BY user",
    )
    .all();
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [
      { user: "a", total_xp: 16, message_xp: 16, voice_xp: 0, manual_xp: 0 },
      {
        user: "b",
        total_xp: 3500,
        message_xp: 3500,
        voice_xp: 0,
        manual_xp: 0,
      },
    ],
  );
});

test("migrate gives the existing daily XP the messages source", () => {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../migrations");
  for (const file of fs.readdirSync(dir).sort())
    if (Number.parseInt(file, 10) <= 22)
      db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  db.exec("PRAGMA user_version = 22");
  db.exec(
    "INSERT INTO xp_daily (guild, user, day, xp) VALUES ('g', 'a', '2026-10-01', 40)",
  );

  migrate(db);

  const rows = db.prepare("SELECT day, source, xp FROM xp_daily").all();
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [{ day: "2026-10-01", source: "messages", xp: 40 }],
  );
});

test("addXp adds the XP to the total and to its own source", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 20, "messages");
  addXp(db, "g", "a", 10, "voice");
  addXp(db, "g", "a", 5, "manual");

  assert.deepEqual(sourcesOf(db), {
    total_xp: 35,
    message_xp: 20,
    voice_xp: 10,
    manual_xp: 5,
  });
});

test("addXp with a manual removal lowers the total and the manual source", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 100, "messages");
  addXp(db, "g", "a", -30, "manual");

  assert.deepEqual(sourcesOf(db), {
    total_xp: 70,
    message_xp: 100,
    voice_xp: 0,
    manual_xp: -30,
  });
});

test("addXp records the daily XP of each source separately", () => {
  const db = createDatabase();
  const day = new Date("2026-10-01T12:00:00Z");
  addXp(db, "g", "a", 10, "messages", day);
  addXp(db, "g", "a", 15, "messages", day);
  addXp(db, "g", "a", 7, "voice", day);

  const rows = db
    .prepare("SELECT day, source, xp FROM xp_daily ORDER BY source")
    .all();
  assert.deepEqual(
    rows.map((row) => ({ ...row })),
    [
      { day: "2026-10-01", source: "messages", xp: 25 },
      { day: "2026-10-01", source: "voice", xp: 7 },
    ],
  );
});

test("addXp rejects an unknown source and changes nothing", () => {
  const db = createDatabase();
  assert.throws(() => addXp(db, "g", "a", 10, "other"), RangeError);
  assert.throws(() => addXp(db, "g", "a", 10), RangeError);
  assert.equal(getTotalXp(db, "g", "a"), 0);
});

test("the database rejects negative message or voice XP", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 50, "manual");
  assert.throws(() => addXp(db, "g", "a", -10, "messages"));
  assert.throws(() => addXp(db, "g", "a", -10, "voice"));
  assert.equal(getTotalXp(db, "g", "a"), 50);
});

test("resetXp wipes every source and the daily XP", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 20, "messages");
  addXp(db, "g", "a", 10, "voice");
  addXp(db, "g", "a", 5, "manual");

  assert.equal(resetXp(db, "g", "a"), 35);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM members").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM xp_daily").get().n, 0);
});

test("getTypeXp reads the XP of one type", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 20, "messages");
  addXp(db, "g", "a", 10, "voice");
  addXp(db, "g", "a", 5, "manual");

  assert.equal(getTypeXp(db, "g", "a"), 35);
  assert.equal(getTypeXp(db, "g", "a", "global"), 35);
  assert.equal(getTypeXp(db, "g", "a", "messages"), 20);
  assert.equal(getTypeXp(db, "g", "a", "voice"), 10);
  assert.equal(getTypeXp(db, "g", "nobody", "voice"), 0);
  assert.throws(() => getTypeXp(db, "g", "a", "manual"), RangeError);
});

test("getBreakdown gives the XP of every source", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 20, "messages");
  addXp(db, "g", "a", -5, "manual");

  assert.deepEqual(getBreakdown(db, "g", "a"), {
    messages: 20,
    voice: 0,
    manual: -5,
  });
  assert.deepEqual(getBreakdown(db, "g", "nobody"), {
    messages: 0,
    voice: 0,
    manual: 0,
  });
});

test("getRank and countRanked work per type", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 300, "messages");
  addXp(db, "g", "b", 100, "messages");
  addXp(db, "g", "b", 500, "voice");
  addXp(db, "g", "c", 50, "manual");

  assert.deepEqual(getRank(db, "g", "a", "messages"), {
    position: 1,
    ranked: 2,
  });
  assert.deepEqual(getRank(db, "g", "b", "voice"), { position: 1, ranked: 1 });
  assert.equal(getRank(db, "g", "a", "voice"), null);
  assert.equal(getRank(db, "g", "c", "messages"), null);
  assert.deepEqual(getRank(db, "g", "b"), { position: 1, ranked: 3 });
  assert.equal(countRanked(db, "g", "voice"), 1);
  assert.equal(countRanked(db, "g", "messages"), 2);
  assert.equal(countRanked(db, "g"), 3);
});

function seedSources(db) {
  addXp(db, "g", "a", 300, "messages", new Date("2026-10-01T12:00:00Z"));
  addXp(db, "g", "a", 100, "voice", new Date("2026-10-01T12:00:00Z"));
  addXp(db, "g", "a", 50, "manual", new Date("2026-10-01T12:00:00Z"));
}

test("previewReset gives the total before and after each type", () => {
  const db = createDatabase();
  seedSources(db);

  assert.deepEqual(previewReset(db, "g", "a"), {
    before: 450,
    removed: 450,
    after: 0,
  });
  assert.deepEqual(previewReset(db, "g", "a", "messages"), {
    before: 450,
    removed: 300,
    after: 150,
  });
  assert.deepEqual(previewReset(db, "g", "a", "voice"), {
    before: 450,
    removed: 100,
    after: 350,
  });
  assert.deepEqual(previewReset(db, "g", "nobody", "voice"), {
    before: 0,
    removed: 0,
    after: 0,
  });
  assert.throws(() => previewReset(db, "g", "a", "manual"), RangeError);
});

test("resetXp by type clears only that source", () => {
  const db = createDatabase();
  seedSources(db);

  assert.equal(resetXp(db, "g", "a", "voice"), 450);
  assert.deepEqual(sourcesOf(db), {
    total_xp: 350,
    message_xp: 300,
    voice_xp: 0,
    manual_xp: 50,
  });
  const days = db.prepare("SELECT source FROM xp_daily ORDER BY source").all();
  assert.deepEqual(
    days.map((row) => row.source),
    ["manual", "messages"],
  );
});

test("resetXp on messages keeps the voice and manual XP", () => {
  const db = createDatabase();
  seedSources(db);

  resetXp(db, "g", "a", "messages");
  assert.deepEqual(sourcesOf(db), {
    total_xp: 150,
    message_xp: 0,
    voice_xp: 100,
    manual_xp: 50,
  });
});

test("resetXp by type never takes the total below zero", () => {
  const db = createDatabase();
  addXp(db, "g", "a", 100, "messages");
  addXp(db, "g", "a", -80, "manual");

  resetXp(db, "g", "a", "messages");
  assert.equal(getTotalXp(db, "g", "a"), 0);
});

test("resetXp all also clears the manual XP", () => {
  const db = createDatabase();
  seedSources(db);

  assert.equal(resetXp(db, "g", "a", "all"), 450);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM members").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM xp_daily").get().n, 0);
});

test("resetXp rejects an unknown type and changes nothing", () => {
  const db = createDatabase();
  seedSources(db);

  assert.throws(() => resetXp(db, "g", "a", "other"), RangeError);
  assert.equal(getTotalXp(db, "g", "a"), 450);
});

test("migration 028 drops the risk score columns and keeps the data", () => {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../migrations");
  for (const file of fs.readdirSync(dir).sort())
    if (Number.parseInt(file, 10) <= 27)
      db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
  db.exec("PRAGMA user_version = 27");
  db.prepare(
    "INSERT INTO automod_settings (guild, sensitivity, escalation_minutes) VALUES ('g', 8, 90)",
  ).run();
  db.prepare(
    "INSERT INTO automod_logs (guild, channel, message, created_at, user_id, points, trust) VALUES ('g', 'c', 'm', 5, 'u', 3, 0.5)",
  ).run();

  migrate(db);

  const columns = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((column) => column.name);
  for (const name of [
    "sensitivity",
    "half_life_days",
    "points_words",
    "points_spam",
    "points_mentions",
  ])
    assert.equal(columns("automod_settings").includes(name), false, name);
  for (const name of ["points", "trust"])
    assert.equal(columns("automod_logs").includes(name), false, name);
  assert.equal(
    db.prepare("SELECT escalation_minutes FROM automod_settings").get()
      .escalation_minutes,
    90,
  );
  assert.equal(
    db.prepare("SELECT user_id FROM automod_logs").get().user_id,
    "u",
  );
});
