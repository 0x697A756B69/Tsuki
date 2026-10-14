const defineCommand = require("../../utils/core/defineCommand");
const rank = require("./rank");

module.exports = defineCommand({
  ...rank,
  name: "r",
  description: "Raccourci de /rank.",
});
