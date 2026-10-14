const defineCommand = require("../utils/core/defineCommand");
const leaderboard = require("./leaderboard");

module.exports = defineCommand({
  ...leaderboard,
  name: "lb",
  description: "Raccourci de /leaderboard.",
});
