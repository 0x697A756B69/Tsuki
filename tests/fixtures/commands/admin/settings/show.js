const defineSubcommand = require("../../../../../utils/defineSubcommand");

module.exports = defineSubcommand({
  name: "show",
  description: "Show.",
  async run() {
    return "show";
  },
});
