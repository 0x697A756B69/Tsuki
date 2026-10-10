const defineSubcommand = require("../../utils/defineSubcommand");
const { runWitness } = require("../../utils/automodWitnessRun");

module.exports = defineSubcommand({
  name: "remove",
  description: "Retirer un témoin de ce salon de contestation.",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le témoin à retirer.",
      required: true,
    },
  ],

  run(bot, interaction, args, db) {
    return runWitness("remove", bot, interaction, args, db);
  },
});
