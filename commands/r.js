const defineCommand = require("../utils/defineCommand");
const rank = require("./rank");

module.exports = defineCommand({
  ...rank,
  name: "r",
  description: "Raccourci de /rank.",
});
