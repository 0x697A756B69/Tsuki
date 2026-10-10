const defineSubcommand = require("../../utils/defineSubcommand");
const { runWitness } = require("../../utils/automodWitnessRun");

module.exports = defineSubcommand({
  name: "add",
  description: "Ajouter un témoin à ce salon de contestation.",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre qui pourra lire et écrire ici.",
      required: true,
    },
  ],

  run(bot, interaction, args, db) {
    return runWitness("add", bot, interaction, args, db);
  },
});
