const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const migrate = require("./migrate");

module.exports = () => {
  const file = process.env.DATABASE_PATH ?? "./data/tsuki.db";
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  for (const migration of migrate(db))
    console.log(`Applied migration ${migration}`);
  return db;
};
