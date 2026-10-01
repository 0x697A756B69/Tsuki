const Discord = require("discord.js");

module.exports = {
  name: "warnlist",
  description: "Affiche les warns d'un membre",
  permission: Discord.PermissionFlagsBits.ManageMessages,
  dm: false,
  category: "Modération",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à afficher",
      required: true,
    },
  ],

  async run(bot, message, args, db) {
    const user = args.getUser("membre");
    const warns = db
      .prepare(
        "SELECT * FROM warns WHERE guild = ? AND user = ? ORDER BY date DESC",
      )
      .all(message.guildId, user.id);

    if (warns.length === 0)
      return message.reply({
        content: `${user} n'a aucun avertissement.`,
        flags: Discord.MessageFlags.Ephemeral,
      });

    const embed = new Discord.EmbedBuilder()
      .setColor(0xfff100)
      .setTitle(`Avertissements de ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .setFooter({ text: `${warns.length} avertissement(s)` })
      .setTimestamp()
      .addFields(
        warns.slice(0, 25).map((warn, i) => ({
          name: `Warn n°${i + 1}`,
          value:
            `> **Auteur :** <@${warn.author}>\n` +
            `> **ID :** \`${warn.id}\`\n` +
            `> **Raison :** \`${warn.reason}\`\n` +
            `> **Date :** <t:${Math.floor(warn.date / 1000)}:F>`,
        })),
      );

    await message.reply({ embeds: [embed] });
  },
};
