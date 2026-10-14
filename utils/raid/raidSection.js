const { getAutomodSettings } = require("../automod/automodSettings");
const { renderRaidView } = require("./raidPanel");
const { getRaidSettings } = require("./raidSettings");

function raidSectionView(db, guildId) {
  return renderRaidView({
    settings: getRaidSettings(db, guildId),
    logChannel: getAutomodSettings(db, guildId).logChannel,
  });
}

module.exports = { raidSectionView };
