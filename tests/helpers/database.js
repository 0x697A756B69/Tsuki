const { DatabaseSync } = require("node:sqlite");
const migrate = require("../../loaders/migrate");

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  return db;
}

module.exports = { createDatabase };
