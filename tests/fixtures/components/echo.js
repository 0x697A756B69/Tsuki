const defineComponent = require("../../../utils/defineComponent");

module.exports = defineComponent({
  id: "echo",
  async run(bot, interaction, params) {
    await interaction.reply(params.join(","));
  },
});
