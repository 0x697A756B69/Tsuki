const { EmbedBuilder } = require("discord.js");
const { describeStep, formatDuration } = require("./warnLadder");

const NOTICE_COLOR = 0xf5a524;
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
        .addFields(fields)
        .setDescription(warnLines({ count, next, validDays }).join("\n")),
    ],
  };
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
  CLOSED_DELETE_DELAY,
  CONTEST_DELETE_DELAY,
  ordinal,
  describeFuture,
  warnLines,
  warnNotice,
  sendNotice,
  closedNotice,
  announceClosedDm,
};
