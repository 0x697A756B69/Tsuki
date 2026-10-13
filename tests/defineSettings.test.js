const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { defineSettings } = require("../utils/defineSettings");

const { get, update } = defineSettings("things", {
  label: ["label", "text"],
  size: ["size", "int"],
  active: ["active", "flag"],
  owner: ["owner", "id"],
});

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE things (
    guild TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT 'a',
    size INTEGER NOT NULL DEFAULT 3,
    active INTEGER NOT NULL DEFAULT 0,
    owner TEXT,
    updated_by TEXT,
    updated_at INTEGER
  )`);
  return db;
}

test("get creates the row and converts each column", () => {
  const db = createDatabase();

  assert.deepEqual(get(db, "g"), {
    label: "a",
    size: 3,
    active: false,
    owner: null,
    updatedBy: null,
    updatedAt: null,
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM things").get().n, 1);
});

test("update writes flags as 0 or 1 and records the author", () => {
  const db = createDatabase();
  const settings = update(
    db,
    "g",
    { label: "b", size: 9, active: true, owner: "42" },
    "admin",
    1000,
  );

  assert.deepEqual(settings, {
    label: "b",
    size: 9,
    active: true,
    owner: "42",
    updatedBy: "admin",
    updatedAt: 1000,
  });
});

test("update refuses an unknown setting and changes nothing", () => {
  const db = createDatabase();

  assert.throws(() => update(db, "g", { nope: 1 }, "admin"), TypeError);
  assert.equal(get(db, "g").updatedBy, null);
});

test("update keeps the settings of other guilds apart", () => {
  const db = createDatabase();
  update(db, "g1", { size: 7 }, "admin");

  assert.equal(get(db, "g2").size, 3);
});
