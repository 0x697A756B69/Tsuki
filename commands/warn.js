const Discord = require("discord.js");
const { canModerate } = require("../utils/hierarchy");
const { issueWarning } = require("../utils/warnSanctions");
const { describeStep } = require("../utils/warnLadder");

const defineCommand = require("../utils/defineCommand");

module.exports = defineCommand({
  name: "warn",
  description: "avertir un membre avec une raison optionnelle.",
  permission: Discord.PermissionFlagsBits.ManageMessages,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à avertir.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison de l'avertissement.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args, db) {
    const user = args.getUser("membre");
    const member = args.getMember("membre");
    const reason = args.getString("raison") ?? "❌";
    const ephemeral = Discord.MessageFlags.Ephemeral;

    if (!member)
      return message.reply({
        content: "Ce membre n'est pas sur le serveur.",
        flags: ephemeral,
      });
    if (message.user.id === user.id)
      return message.reply({
        content: "Tu ne peux pas t'avertir !",
        flags: ephemeral,
      });

    if (!canModerate(message.member, member))
      return message.reply({
        content: "Tu ne peux pas avertir ce membre !",
        flags: ephemeral,
      });

    const warning = await issueWarning({
      db,
      guild: message.guild,
      user,
      member,
      userId: user.id,
      id: await bot.utils.createId("WARN"),
      authorId: message.user.id,
      reason,
    });

    const sanction = warning.applied
      ? `> **Sanction :** ${describeStep(warning.step)}\n`
      : "";
    const closed = warning.delivered
      ? ""
      : "\n-# Messages privés fermés : le membre n'a pas été prévenu.";

    await message.reply(
      `⚠️ ${user} a reçu un avertissement (${warning.count} actif${warning.count > 1 ? "s" : ""}).\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\`\n` +
        sanction +
        `> **ID :** \`${warning.id}\`${closed}`,
    );
  },
});
