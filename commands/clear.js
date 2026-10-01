const Discord = require("discord.js");

module.exports = {
  name: "clear",
  description: "  Efface les messages du salon.",
  permission: Discord.PermissionFlagsBits.ManageMessages,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "number",
      name: "nombre",
      description: "Le nombre de messages à supprimer.",
      required: true,
      autocomplete: false,
    },
    {
      type: "channel",
      name: "salon",
      description: "Le salon où effacer les messages",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    let channel = args.getChannel("salon");
    if (!channel) channel = message.channel;
    if (
      channel.id !== message.channel.id &&
      !message.guild.channels.cache.get(channel.id)
    )
      return message.reply({
        content: "Pas de salon !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    let number = args.getNumber("nombre");
    if (parseInt(number) <= 0 || parseInt(number) > 100)
      return message.reply({
        content: "Il me faut un nombre entre `0` et `100` inclus !",
        flags: Discord.MessageFlags.Ephemeral,
      });

    try {
      let messages = await channel.bulkDelete(parseInt(number));

      await message.reply({
        content: `J'ai bien supprimé \`${messages.size}\` message(s) dans le salon ${channel} !`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    } catch (err) {
      let messages = [...(await channel.messages.fetch()).values()].filter(
        async (m) => Date.now() - m.createdAt <= 1209600000,
      );
      if (!messages.length <= 0)
        return message.reply({
          content:
            "Je ne peux pas surprimer les messages qui ont une date supérieur à 14 jours !",
          flags: Discord.MessageFlags.Ephemeral,
        });
      await channel.bulkDelete(messages);

      await message.reply({
        content: `J'ai pu supprimé uniquement \`${messages.size}\` message(s) dans le salon ${channel} car les autres dataient de plus 14 jours !`,
        flags: Discord.MessageFlags.Ephemeral,
      });
    }
  },
};
