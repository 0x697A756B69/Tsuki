const { MessageFlags } = require("discord.js");
const defineSubcommand = require("../../utils/defineSubcommand");
const { addXp } = require("../../utils/xp");
const { updateRewardRoles } = require("../../utils/rewards");
const {
  checkMember,
  checkAmount,
  formatAdjustment,
} = require("../../utils/xpAdmin");

module.exports = defineSubcommand({
  name: "donner",
  description: "Donner de l'XP à un membre.",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre qui reçoit l'XP.",
      required: true,
    },
    {
      type: "integer",
      name: "montant",
      description: "La quantité d'XP à donner.",
      required: true,
    },
  ],

  async run(bot, interaction, args, db) {
    const member = args.getMember("membre");
    const amount = args.getInteger("montant", true);

    const error = checkMember(member) ?? checkAmount(amount);
    if (error)
      return interaction.reply({
        content: error,
        flags: MessageFlags.Ephemeral,
      });

    const result = addXp(db, interaction.guildId, member.id, amount);
    if (result.level !== result.previousLevel)
      await updateRewardRoles(db, interaction.guildId, member, result.level);
    await interaction.reply(formatAdjustment(member, result));
  },
});
