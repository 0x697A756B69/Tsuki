const defineSubcommand = require("../../../../../utils/core/defineSubcommand");

module.exports = defineSubcommand({
  name: "show",
  description: "Show.",
  async run() {
    return "show";
  },
});
