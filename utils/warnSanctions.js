const {
  getLadder,
  stepFor,
  nextSanction,
  isActive,
  expiresAt,
  countActiveWarnings,
} = require("./warnLadder");
const { getAutomodSettings } = require("./automodSettings");
const { warnNotice, sendNotice } = require("./moderationNotice");

const MINUTE = 60 * 1000;

function insertWarning(
  db,
  { id, guildId, userId, authorId, reason, date = Date.now() },
) {
  db.prepare(
    "INSERT INTO warns (id, guild, user, author, reason, date) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, guildId, userId, authorId, reason, date);
}

function noteSanction(db, warningId, sanction, timeoutUntil = null) {
  db.prepare(
    "UPDATE warns SET sanction = ?, timeout_until = ? WHERE id = ?",
  ).run(sanction, timeoutUntil, warningId);
}

function listWarnings(db, guildId, userId, validDays, now = Date.now()) {
  return db
    .prepare(
      "SELECT * FROM warns WHERE guild = ? AND user = ? ORDER BY date DESC",
    )
    .all(guildId, userId)
    .map((row) => ({
      id: String(row.id),
      author: String(row.author),
      reason: String(row.reason),
      date: Number(row.date),
      sanction: row.sanction === null ? null : String(row.sanction),
      timeoutUntil:
        row.timeout_until === null ? null : Number(row.timeout_until),
      active: isActive(Number(row.date), validDays, now),
      expiresAt: expiresAt(Number(row.date), validDays),
    }));
}

function removeWarning(db, guildId, userId, warningId) {
  const row = db
    .prepare(
      "SELECT sanction, timeout_until FROM warns WHERE id = ? AND guild = ? AND user = ?",
    )
    .get(warningId, guildId, userId);
  if (!row) return null;
  db.prepare("DELETE FROM warns WHERE id = ?").run(warningId);
  return {
    sanction: row.sanction === null ? null : String(row.sanction),
    timeoutUntil: row.timeout_until === null ? null : Number(row.timeout_until),
  };
}

function registerWarning(
  db,
  { id, guildId, userId, authorId, reason, date = Date.now() },
) {
  insertWarning(db, { id, guildId, userId, authorId, reason, date });
  const { warnValidDays } = getAutomodSettings(db, guildId);
  const ladder = getLadder(db, guildId);
  const count = countActiveWarnings(db, guildId, userId, warnValidDays, date);
  return {
    id,
    userId,
    reason,
    count,
    validDays: warnValidDays,
    step: stepFor(ladder, count),
    next: nextSanction(ladder, count),
  };
}

function canApply(member, step) {
  if (step === null || step.sanction === null) return false;
  if (step.sanction === "timeout") return member?.moderatable === true;
  if (step.sanction === "kick") return member?.kickable === true;
  return member === null || member?.bannable === true;
}

function liftTarget(warning, member, now = Date.now()) {
  if (warning?.sanction === "ban") return "ban";
  if (
    warning?.sanction === "timeout" &&
    warning.timeoutUntil !== null &&
    warning.timeoutUntil > now &&
    member?.communicationDisabledUntilTimestamp === warning.timeoutUntil
  )
    return "timeout";
  return null;
}

async function applySanction({ guild, member, userId, step, reason, now }) {
  if (!canApply(member, step)) return null;
  try {
    if (step.sanction === "timeout") {
      const updated = await member.timeout(step.minutes * MINUTE, reason);
      return {
        sanction: "timeout",
        timeoutUntil:
          updated?.communicationDisabledUntilTimestamp ??
          now + step.minutes * MINUTE,
      };
    }
    if (step.sanction === "kick") await member.kick(reason);
    else await guild.bans.create(userId, { reason });
    return { sanction: step.sanction, timeoutUntil: null };
  } catch {
    return null;
  }
}

async function liftSanction({ guild, member, userId, warning, reason, now }) {
  const target = liftTarget(warning, member, now);
  try {
    if (target === "timeout") await member.timeout(null, reason);
    else if (target === "ban") await guild.bans.remove(userId, reason);
  } catch {
    return null;
  }
  return target;
}

async function enforceWarning({
  db,
  guild,
  user,
  member,
  warning,
  components = [],
  now = Date.now(),
}) {
  const effective = canApply(member, warning.step) ? warning.step : null;
  const until =
    effective?.sanction === "timeout" ? now + effective.minutes * MINUTE : null;

  const notice = warnNotice({
    guildName: guild.name,
    reason: warning.reason,
    count: warning.count,
    step: effective,
    next: warning.next,
    validDays: warning.validDays,
    until,
  });
  const delivered = await sendNotice(user, { ...notice, components });

  const applied =
    effective === null
      ? null
      : await applySanction({
          guild,
          member,
          userId: warning.userId,
          step: effective,
          reason: `Avertissements actifs : ${warning.count}`,
          now,
        });
  if (applied !== null)
    noteSanction(db, warning.id, applied.sanction, applied.timeoutUntil);
  return { delivered, applied };
}

async function issueWarning({
  db,
  guild,
  user,
  member,
  userId,
  id,
  authorId,
  reason,
  date = Date.now(),
}) {
  const warning = registerWarning(db, {
    id,
    guildId: guild.id,
    userId,
    authorId,
    reason,
    date,
  });
  const outcome = await enforceWarning({
    db,
    guild,
    user,
    member,
    warning,
    now: date,
  });
  return { ...warning, ...outcome };
}

async function retractWarning({
  db,
  guild,
  userId,
  warningId,
  member,
  reason,
  now = Date.now(),
}) {
  const warning = removeWarning(db, guild.id, userId, warningId);
  if (warning === null) return { removed: false, lifted: null };
  const lifted = await liftSanction({
    guild,
    member,
    userId,
    warning,
    reason,
    now,
  });
  return { removed: true, lifted };
}

module.exports = {
  insertWarning,
  noteSanction,
  listWarnings,
  removeWarning,
  registerWarning,
  canApply,
  liftTarget,
  applySanction,
  liftSanction,
  enforceWarning,
  issueWarning,
  retractWarning,
};
