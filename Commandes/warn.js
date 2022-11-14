const Discord = require("discord.js");

module.exports = {
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
    let user = args.getUser("membre");
    if (!user)
      return message.Reply({ content: "Pas de membre !", ephmeral: true });
    let member = message.guild.members.cache.get(user.id);
    if (!member)
      return message.reply({ content: "Pas de membre", ephmeral: true });

    let reason = args.getString("raison");
    if (!reason) reason = "❌";

    if (message.user.id === user.id)
      return message.reply({ content: "Tu ne peux pas t'avertir !", ephmeral });
    if ((await message.guild.fetchOwner()).id === user.id)
      return message.reply({
        content: "Tu ne peux pas avertir le propriétaire du serveur !",
        ephmeral: true,
      });
    if (
      message.member.roles.highest.comparePositionTo(member.roles.highest) <= 0
    )
      return message.reply({
        content: "Tu ne peux pas avertir ce membre !",
        ephmeral: true,
      });
    if (
      (await message.guild.members.fetchMe()).roles.highest.comparePositionTo(
        member.roles.highest
      ) <= 0
    )
      return message.reply({ content: "Je ne peux pas avertir ce membre !" });

    try {
      await user.send(
        `${message.user.tag} vous a warns sur le serveur ${message.guild.name} pour la raison : \`${reason}\``
      );
    } catch (err) {}

    await message.reply(
      `Vous avez warn ${user.tag} pour la raison : \`${reason}\``
    );

    let ID = await bot.function.createId("WARN");

    db.query(
      `INSERT INTO warns (guild, user, author, warn, reason, date) VALUES ('${
        message.guild.id
      }', '${user.id}', '${message.user.id}', '${ID}', '${reason.replace(
        /'/g,
        "\\'"
      )}', '${Date.now()}') `
    );
  },
};
