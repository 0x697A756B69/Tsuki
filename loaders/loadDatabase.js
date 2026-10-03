const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

module.exports = () => {
  const file = process.env.DATABASE_PATH ?? "./data/tsuki.db";
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8"));
  return db;
};
