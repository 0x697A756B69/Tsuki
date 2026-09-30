const Discord = require("discord.js");
const ms = require("ms");

module.exports = {
  name: "timeout",
  description: "Timeout un membre avec une raison et une durée optionnelles.",
  permission: Discord.PermissionFlagsBits.ModerateMembers,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à timeout.",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "temps",
      description: "Durée du timeout. (Exemple 1d pour 1 jour)",
      required: true,
      autocomplete: false,
    },
    {
      type: "string",
      name: "raison",
      description: "La raison du timeout.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    let user = args.getUser("membre");
    if (!user) return message.reply("Pas de membre !");
    let member = message.guild.members.cache.get(user.id);
    if (!member) return message.reply("Pas de membre !");

    let time = args.getString("temps");
    if (!time)
      return message.reply({
        content: "Pas de temps !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if (isNaN(ms(time)))
      return message.reply({
        content: "Pas le bon format !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if (ms(time) > 2419200000)
      return message.reply({
        content: "Je ne peux pas exclure temporairement plus que 28 jours !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    let reason = args.getString("raison");
    if (!reason) reason = "❌";

    if (message.user.id === user.id)
      return message.reply({
        content: "je ne peux pas t'exclure temporairement !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if ((await message.guild.fetchOwner()).id === user.id)
      return message.reply({
        content:
          "Tu ne peux pas exclure temporairement le propriétaire du serveur !",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if (!member.moderatable)
      return message.reply({
        content: "Je ne peux pas exclure temporairement ce membre ! ",
        flags: Discord.MessageFlags.Ephemeral,
      });
    if (
      message.member.roles.highest.comparePositionTo(member.roles.highest) <= 0
    )
      return message.reply({
        content: "Tu ne peut pas exclu(e) temporairement cette personne !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    try {
      await user.send(
        `Vous avez été exclu(e) temporairement de ${message.guild.name}.\n` +
          `> **Modérateur :** ${message.user.tag}\n` +
          `> **Fin de l'exclusion:** <t:${Math.round(
            (Date.now() + ms(time)) / 1000,
          )}:R>\n` +
          `> **Raison :** \`${reason}\``,
      );
    } catch (err) {}

    message.reply(
      `<:timeout:1035248378495381504> ${user} a été exclu(e) temporairement.\n` +
        `> **Fin de l'exclusion:** <t:${Math.round(
          (Date.now() + ms(time)) / 1000,
        )}:R>\n` +
        `> **Raison** : \`${reason}\``,
    );

    await member.timeout(ms(time), reason);
  },
};
