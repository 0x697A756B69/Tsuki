const defineCommand = require("../../../../utils/core/defineCommand");

module.exports = defineCommand({
  name: "pong",
  description: "Pong.",
  permission: "Aucune",
  category: "Test",
  dm: true,
  async run() {
    return "pong";
  },
});
