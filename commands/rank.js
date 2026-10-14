const { AttachmentBuilder, MessageFlags } = require("discord.js");
const defineCommand = require("../utils/core/defineCommand");
const { checkMember } = require("../utils/xpAdmin");
const { getSettings } = require("../utils/settings");
const {
  getRankCardData,
  formatNoXp,
  getCardColors,
} = require("../utils/rankCommand");

module.exports = defineCommand({
  name: "rank",
  description: "Voir la carte de rang d'un membre.",
  permission: "Aucune",
  category: "Expérience",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à afficher (toi par défaut).",
    },
    {
      type: "string",
      name: "type",
      description: "Le type d'XP à afficher (global par défaut).",
      choices: [
        { name: "Global", value: "global" },
        { name: "Messages", value: "messages" },
        { name: "Vocal", value: "voice" },
      ],
    },
  ],

  async run(bot, interaction, args, db) {
    const isSelf = !args.getUser("membre");
    const type = args.getString("type") ?? "global";
    const member = isSelf ? interaction.member : args.getMember("membre");

    const error = checkMember(member);
    if (error)
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral,
      });

    const data = getRankCardData(db, interaction.guildId, member.id, type);
    if (!data)
      return interaction.reply({
        content: formatNoXp(member, isSelf, type),
        flags: MessageFlags.Ephemeral,
      });

    await interaction.deferReply();
    const { renderRankCard } = require("../utils/rankCard");
    const card = await renderRankCard({
      ...data,
      colors: getCardColors(getSettings(db, interaction.guildId).cardAccent),
      username: member.displayName,
      avatar: member.displayAvatarURL({ extension: "png", size: 256 }),
    });
    await interaction.editReply({
      files: [new AttachmentBuilder(card, { name: "rank.png" })],
    });
  },
});
