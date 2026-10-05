const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("../loaders/migrate");
const { toDay, addXp, countRanked } = require("../utils/xp");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

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

  assert.deepEqual(addXp(db, "g", "a", 60), { previousLevel: 0, level: 0 });
  assert.deepEqual(addXp(db, "g", "a", 60), { previousLevel: 0, level: 1 });

  const { total_xp } = db.prepare("SELECT total_xp FROM members").get();
  assert.equal(total_xp, 120);
});

test("addXp records XP per day", () => {
  const db = createDatabase();
  const day = new Date("2026-10-01T12:00:00Z");

  addXp(db, "g", "a", 10, day);
  addXp(db, "g", "a", 15, day);
  addXp(db, "g", "a", 5, new Date("2026-10-02T12:00:00Z"));

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
  addXp(db, "g", "a", 10);
  addXp(db, "g", "b", 10);
  addXp(db, "other", "c", 10);

  assert.equal(countRanked(db, "g"), 2);
  assert.equal(countRanked(db, "empty"), 0);
});
