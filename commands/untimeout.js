const Discord = require("discord.js");
const { canModerate } = require("../utils/hierarchy");

const defineCommand = require("../utils/defineCommand");

module.exports = defineCommand({
  name: "untimeout",
  description: "Lever l'exclusion temporaire d'un membre.",
  permission: Discord.PermissionFlagsBits.ModerateMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à réintégrer.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison de la levée.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    const user = args.getUser("membre");
    const member = args.getMember("membre");
    const reason = args.getString("raison") ?? "❌";
    const ephemeral = Discord.MessageFlags.Ephemeral;

    if (!member)
      return message.reply({
        content: "Ce membre n'est pas sur le serveur !",
        flags: ephemeral,
      });
    if (!member.isCommunicationDisabled())
      return message.reply({
        content: "Ce membre n'est pas exclu temporairement !",
        flags: ephemeral,
      });
    if (!canModerate(message.member, member))
      return message.reply({
        content: "Tu ne peux pas réintégrer ce membre !",
        flags: ephemeral,
      });
    if (!member.moderatable)
      return message.reply({
        content: "Je ne peux pas réintégrer ce membre !",
        flags: ephemeral,
      });

    await member.timeout(null, reason);

    await user
      .send(
        `Tu n'es plus exclu(e) temporairement de ${message.guild.name}.\n` +
          `> **Modérateur :** ${message.user.tag}\n` +
          `> **Raison :** \`${reason}\``,
      )
      .catch(() => {});

    await message.reply(
      `<:timeout:1035248378495381504> ${user} n'est plus exclu(e) temporairement.\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\``,
    );
  },
});
