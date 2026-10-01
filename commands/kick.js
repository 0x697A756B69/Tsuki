const Discord = require("discord.js");
const { canModerate } = require("../utils/hierarchy");

module.exports = {
  name: "kick",
  description: "Exclure un membre avec une raison optionnelle.",
  permission: Discord.PermissionFlagsBits.KickMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à exclure.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison de l'exclusion.",
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
    if (message.user.id === user.id)
      return message.reply({
        content: "Tu ne peux pas t'exclure du serveur !",
        flags: ephemeral,
      });
    if (!canModerate(message.member, member))
      return message.reply({
        content: "Tu ne peux pas exclure ce membre !",
        flags: ephemeral,
      });
    if (!member.kickable)
      return message.reply({
        content: "Je ne peux pas exclure ce membre !",
        flags: ephemeral,
      });

    await user
      .send(
        `Tu as été exclu(e) de ${message.guild.name}.\n` +
          `> **Modérateur :** ${message.user.tag}\n` +
          `> **Raison :** \`${reason}\``,
      )
      .catch(() => {});

    await member.kick(reason);

    await message.reply(
      `<:expulser:1035322289308307526> ${user} a été exclu(e).\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\``,
    );
  },
};
