const Discord = require("discord.js");
const ms = require("ms");
const { canModerate } = require("../utils/hierarchy");

const MAX_DURATION = 28 * 24 * 60 * 60 * 1000;

module.exports = {
  name: "timeout",
  description: "Exclure temporairement un membre avec une raison optionnelle.",
  permission: Discord.PermissionFlagsBits.ModerateMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à exclure temporairement.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "temps",
      description: "Durée de l'exclusion (exemple : 10m, 2h, 1d).",
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
    const duration = ms(args.getString("temps"));
    const reason = args.getString("raison") ?? "❌";
    const ephemeral = Discord.MessageFlags.Ephemeral;

    if (!member)
      return message.reply({
        content: "Ce membre n'est pas sur le serveur !",
        flags: ephemeral,
      });
    if (!duration || duration <= 0)
      return message.reply({
        content: "Durée invalide ! Exemple : `10m`, `2h`, `1d`.",
        flags: ephemeral,
      });
    if (duration > MAX_DURATION)
      return message.reply({
        content: "La durée maximale est de 28 jours !",
        flags: ephemeral,
      });
    if (message.user.id === user.id)
      return message.reply({
        content: "Tu ne peux pas t'exclure temporairement !",
        flags: ephemeral,
      });
    if (!canModerate(message.member, member))
      return message.reply({
        content: "Tu ne peux pas exclure temporairement ce membre !",
        flags: ephemeral,
      });
    if (!member.moderatable)
      return message.reply({
        content: "Je ne peux pas exclure temporairement ce membre !",
        flags: ephemeral,
      });

    const end = `<t:${Math.round((Date.now() + duration) / 1000)}:R>`;

    await user
      .send(
        `Tu as été exclu(e) temporairement de ${message.guild.name}.\n` +
          `> **Modérateur :** ${message.user.tag}\n` +
          `> **Fin de l'exclusion :** ${end}\n` +
          `> **Raison :** \`${reason}\``,
      )
      .catch(() => {});

    await member.timeout(duration, reason);

    await message.reply(
      `<:timeout:1035248378495381504> ${user} a été exclu(e) temporairement.\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Fin de l'exclusion :** ${end}\n` +
        `> **Raison :** \`${reason}\``,
    );
  },
};
