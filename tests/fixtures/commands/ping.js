const defineCommand = require("../../../utils/defineCommand");

module.exports = defineCommand({
  name: "ping",
  description: "Ping.",
  permission: "Aucune",
  category: "Test",
  dm: true,
  async run() {
    return "ping";
  },
});
