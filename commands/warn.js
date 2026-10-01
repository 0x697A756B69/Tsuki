const Discord = require("discord.js");
const { canModerate } = require("../utils/hierarchy");

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

    const id = await bot.utils.createId("WARN");
    db.prepare(
      "INSERT INTO warns (id, guild, user, author, reason, date) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, message.guildId, user.id, message.user.id, reason, Date.now());

    await user
      .send(
        `Tu as reçu un avertissement sur ${message.guild.name}.\n> **Raison :** \`${reason}\``,
      )
      .catch(() => {});

    await message.reply(
      `⚠️ ${user} a reçu un avertissement.\n` +
        `> **Modérateur :** ${message.user}\n` +
        `> **Raison :** \`${reason}\`\n` +
        `> **ID :** \`${id}\``,
    );
  },
};
