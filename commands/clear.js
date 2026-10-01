const Discord = require("discord.js");

module.exports = {
  name: "clear",
  description: "Supprimer des messages dans un salon.",
  permission: Discord.PermissionFlagsBits.ManageMessages,
  category: "Modération",
  dm: false,
  options: [
    {
      type: "integer",
      name: "nombre",
      description: "Le nombre de messages à supprimer (1 à 100).",
      required: true,
      autocomplete: false,
    },
    {
      type: "channel",
      name: "salon",
      description: "Le salon où supprimer les messages.",
      required: false,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    const channel = args.getChannel("salon") ?? message.channel;
    const amount = args.getInteger("nombre");
    const ephemeral = Discord.MessageFlags.Ephemeral;

    if (amount < 1 || amount > 100)
      return message.reply({
        content: "Le nombre doit être compris entre 1 et 100 !",
        flags: ephemeral,
      });
    if (!channel.isTextBased())
      return message.reply({
        content: "Je ne peux pas supprimer de messages dans ce salon !",
        flags: ephemeral,
      });
    if (
      !channel
        .permissionsFor(message.member)
        .has(Discord.PermissionFlagsBits.ManageMessages)
    )
      return message.reply({
        content:
          "Tu n'as pas la permission de gérer les messages dans ce salon !",
        flags: ephemeral,
      });

    const deleted = await channel.bulkDelete(amount, true);

    await message.reply({
      content:
        deleted.size < amount
          ? `${deleted.size} message(s) supprimé(s) dans ${channel}. Les messages de plus de 14 jours ne peuvent pas être supprimés.`
          : `${deleted.size} message(s) supprimé(s) dans ${channel}.`,
      flags: ephemeral,
    });
  },
};
