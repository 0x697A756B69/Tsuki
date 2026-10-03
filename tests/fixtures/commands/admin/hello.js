const defineSubcommand = require("../../../../utils/defineSubcommand");

module.exports = defineSubcommand({
  name: "hello",
  description: "Hello.",
  options: [
    { type: "user", name: "membre", description: "Membre.", required: true },
  ],
  async run() {
    return "hello";
  },
});
