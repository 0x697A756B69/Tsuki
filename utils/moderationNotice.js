const { EmbedBuilder } = require("discord.js");
const { describeStep, formatDuration } = require("./warnLadder");

const NOTICE_COLOR = 0xf5a524;
const COLORS = {
  timeout: 0xf5a524,
  kick: 0xf76b15,
  ban: 0xe5484d,
  lifted: 0x30a46c,
  accepted: 0x30a46c,
  refused: 0x8e8e93,
};
const CLOSED_DELETE_DELAY = 8000;
const CONTEST_DELETE_DELAY = 5 * 60 * 1000;

function ordinal(count) {
  return count === 1 ? "1er" : `${count}e`;
}

function describeFuture(step) {
  if (step.sanction === "timeout")
    return `en sourdine de ${formatDuration(step.minutes)}`;
  return step.sanction === "kick" ? "expulsé" : "banni";
}

function warnLines({ count, next, validDays }) {
  const lines = [`C'est ton ${ordinal(count)} avertissement actif.`];
  if (next !== null)
    lines.push(
      `Au ${ordinal(next.warns)} avertissement, tu seras ${describeFuture(next)}.`,
    );
  if (validDays > 0)
    lines.push(
      `Celui-ci expire dans ${validDays} jour${validDays > 1 ? "s" : ""}.`,
    );
  return lines;
}

function sanctionLabel(step) {
  const text = describeStep(step ?? { sanction: null });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function warnNotice({
  guildName,
  reason,
  count,
  step,
  next,
  validDays,
  until = null,
}) {
  const fields = [
    { name: "Raison", value: reason, inline: true },
    { name: "Sanction", value: sanctionLabel(step), inline: true },
  ];
  if (until !== null)
    fields.push({
      name: "Fin",
      value: `<t:${Math.floor(until / 1000)}:f>`,
      inline: true,
    });

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(NOTICE_COLOR)
        .setTitle(`Avertissement sur ${guildName}`)
        .setFooter({ text: guildName })
        .addFields(fields)
        .setDescription(warnLines({ count, next, validDays }).join("\n")),
    ],
  };
}

function noticeEmbed({ color, title, guildName, fields, lines }) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(fields)
        .setDescription(lines.join("\n"))
        .setFooter({ text: guildName }),
    ],
  };
}

function reasonFields(reason, moderator) {
  return [
    { name: "Raison", value: reason, inline: true },
    { name: "Modérateur", value: moderator, inline: true },
  ];
}

function banNotice({ guildName, reason, moderator }) {
  return noticeEmbed({
    color: COLORS.ban,
    title: `Bannissement de ${guildName}`,
    guildName,
    fields: reasonFields(reason, moderator),
    lines: ["Tu ne peux plus rejoindre ce serveur."],
  });
}

function kickNotice({ guildName, reason, moderator }) {
  return noticeEmbed({
    color: COLORS.kick,
    title: `Expulsion de ${guildName}`,
    guildName,
    fields: reasonFields(reason, moderator),
    lines: ["Tu peux revenir avec une nouvelle invitation."],
  });
}

function timeoutNotice({ guildName, reason, moderator, until }) {
  const [first, last] = reasonFields(reason, moderator);
  return noticeEmbed({
    color: COLORS.timeout,
    title: `Sourdine sur ${guildName}`,
    guildName,
    fields: [
      first,
      { name: "Fin", value: `<t:${Math.floor(until / 1000)}:f>`, inline: true },
      last,
    ],
    lines: ["Tu ne peux plus écrire ni parler jusqu'à la fin."],
  });
}

function untimeoutNotice({ guildName, reason, moderator }) {
  return noticeEmbed({
    color: COLORS.lifted,
    title: `Sourdine levée sur ${guildName}`,
    guildName,
    fields: reasonFields(reason, moderator),
    lines: ["Tu peux de nouveau écrire et parler."],
  });
}

const LIFTED_LINES = {
  timeout: "Ta sourdine est levée.",
  ban: "Ton bannissement est levé.",
};

function verdictNotice({ guildName, accepted, lifted = null }) {
  const lines = accepted
    ? ["Ton avertissement est retiré."]
    : ["L'avertissement est maintenu."];
  if (accepted && LIFTED_LINES[lifted]) lines.push(LIFTED_LINES[lifted]);
  return noticeEmbed({
    color: accepted ? COLORS.accepted : COLORS.refused,
    title: `Contestation ${accepted ? "acceptée" : "refusée"} sur ${guildName}`,
    guildName,
    fields: [],
    lines,
  });
}

async function sendNotice(user, payload) {
  if (!user) return false;
  return user
    .send(payload)
    .then(() => true)
    .catch(() => false);
}

function closedNotice(userId, contestable = false) {
  const notice = `⚠️ <@${userId}> a reçu un avertissement, mais ses messages privés sont fermés.`;
  return contestable
    ? `${notice}
Il peut le contester avec le bouton ci-dessous.`
    : notice;
}

async function announceClosedDm(
  channel,
  userId,
  delay = undefined,
  components = [],
) {
  const contestable = components.length > 0;
  const wait =
    delay ?? (contestable ? CONTEST_DELETE_DELAY : CLOSED_DELETE_DELAY);
  const message = await channel
    ?.send({
      content: closedNotice(userId, contestable),
      components,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
  if (!message) return false;
  await new Promise((resolve) => {
    setTimeout(resolve, wait).unref();
  });
  await message.delete().catch(() => {});
  return true;
}

module.exports = {
  NOTICE_COLOR,
  COLORS,
  CLOSED_DELETE_DELAY,
  CONTEST_DELETE_DELAY,
  ordinal,
  describeFuture,
  warnLines,
  warnNotice,
  banNotice,
  kickNotice,
  timeoutNotice,
  untimeoutNotice,
  verdictNotice,
  sendNotice,
  closedNotice,
  announceClosedDm,
};
