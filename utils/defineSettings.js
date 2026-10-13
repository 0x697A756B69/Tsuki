const READERS = {
  id: (value) => (value === null ? null : String(value)),
  flag: (value) => Number(value) === 1,
  int: (value) => Number(value),
  text: (value) => String(value),
};

function defineSettings(table, fields) {
  const columns = Object.fromEntries(
    Object.entries(fields).map(([key, [column]]) => [key, column]),
  );

  function toSettings(row) {
    const settings = {};
    for (const [key, [column, type]] of Object.entries(fields))
      settings[key] = READERS[type](row[column]);
    settings.updatedBy = READERS.id(row.updated_by);
    settings.updatedAt =
      row.updated_at === null ? null : Number(row.updated_at);
    return settings;
  }

  function get(db, guildId) {
    const select = db.prepare(`SELECT * FROM ${table} WHERE guild = ?`);
    let row = select.get(guildId);
    if (!row) {
      db.prepare(`INSERT INTO ${table} (guild) VALUES (?)`).run(guildId);
      row = select.get(guildId);
    }
    return toSettings(row);
  }

  function update(db, guildId, changes, authorId, date = Date.now()) {
    const entries = Object.entries(changes);
    for (const [key] of entries)
      if (!(key in columns)) throw new TypeError(`Unknown setting: ${key}`);

    get(db, guildId);
    const assignments = [
      ...entries.map(([key]) => `${columns[key]} = ?`),
      "updated_by = ?",
      "updated_at = ?",
    ].join(", ");
    db.prepare(`UPDATE ${table} SET ${assignments} WHERE guild = ?`).run(
      ...entries.map(([, value]) =>
        typeof value === "boolean" ? Number(value) : value,
      ),
      authorId,
      date,
      guildId,
    );
    return get(db, guildId);
  }

  return { get, update };
}

module.exports = { defineSettings };
