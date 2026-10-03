const fs = require("node:fs");
const path = require("node:path");
const transaction = require("../utils/transaction");

const dir = path.join(__dirname, "../migrations");

module.exports = (db) => {
  const current = Number(db.prepare("PRAGMA user_version").get().user_version);
  const applied = [];

  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const version = Number.parseInt(file, 10);
    if (version <= current) continue;

    transaction(db, () => {
      db.exec(fs.readFileSync(path.join(dir, file), "utf8"));
      db.exec(`PRAGMA user_version = ${version}`);
    });
    applied.push(file);
  }

  return applied;
};
