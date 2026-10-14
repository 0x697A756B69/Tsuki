const Discord = require("discord.js");
const { getAutomodSettings } = require("../../utils/automod/automodSettings");
const { listWarnings } = require("../../utils/moderation/warnSanctions");
const { warnlistView } = require("../../utils/moderation/warnlistPanel");

const defineCommand = require("../../utils/core/defineCommand");

module.exports = defineCommand({
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
    const { warnValidDays } = getAutomodSettings(db, message.guildId);
    const warnings = listWarnings(db, message.guildId, user.id, warnValidDays);

    if (warnings.length === 0)
      return message.reply({
        content: `${user} n'a aucun avertissement.`,
        flags: Discord.MessageFlags.Ephemeral,
      });

    await message.reply({
      ...warnlistView({
        user,
        warnings,
        page: 0,
        authorId: message.user.id,
      }),
      flags:
        Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
    });
  },
});
