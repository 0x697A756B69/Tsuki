const Discord = require("discord.js");

module.exports = {
  name: "user-info",
  description: "Avoir les informaitons du membre.",
  permission: "Aucune",
  category: "Information",
  dm: false,
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à exclure.",
      required: true,
      autocomplete: false,
    },
  ],

  async run(bot, message, args) {
    const member = args.getMember("membre");

    const { user, presence, roles } = member;

    const formatter = new Intl.ListFormat("en", {
      style: "narrow",
      type: "conjonction",
    });

    await user.fetch();

    const statusType = {
      idle: "https://zupimages.net/up/22/45/knp2.png",
      dnd: "https://zupimages.net/up/22/45/ot5q.png",
      online: "https://zupimages.net/up/22/45/57md.png",
      invisible: "https://zupimages.net/up/22/45/ovcx.png",
    };

    const activityType = [
      "🕹 *Playing*",
      "🎙 *Streaming*",
      "🎧 *Listening to*",
      "📺 *Watching*",
      "🤹🏻‍♀️ *Custom*",
      "🏆 *Competing in*",
    ];

    const clientType = [
      { name: "ordinateur", text: "Ordinateur", emoji: "💻" },
      { name: "mobile", text: "Téléphone", emoji: "🤳🏻" },
      { name: "web", text: "Website", emoji: "🌍" },
      { name: "hors ligne", text: "Hors ligne", emoji: "💤" },
    ];

    const badges = {
      BugHunterLevel1: "<:BugHunterBadge:1040792064918552636>",
      BugHunterLevel2: "<:BugHunterGoldBadge:1040792178244468776>",
      CertifiedModerator: "<:certified_moderator:1040792447124508713>",
      HypeSquadOnlineHouse1: "<:bravery:1040793270776758372>",
      HypeSquadOnlineHouse2: "<:brilliance:1040793340951662632>",
      HypeSquadOnlineHouse3: "<:balance:1040793186584498308>",
      Hypesquad: "<:HypeSquad:1040793471700713542>",
      Partner: "<:partener:1040793661471981578>",
      PremiumEarlySupporter: "<:EarlySupportBadge:1040795329735446530>",
      Staff: "<:staff:1040795527375241257>",
    };

    const maxDisplayRoles = (roles, maxFieldLength = 1024) => {
      let totalLength = 0;
      const result = [];

      for (const role of roles) {
        const roleString = `<@&${role.id}>`;

        if (roleString.length + totalLength > maxFieldLength) break;

        totalLength += roleString.length + 1;
        result.push(roleString);
      }

      return result.length;
    };
    const sortedRoles = member.roles.cache
      .map((role) => role)
      .sort((a, b) => b.position - a.position)
      .slice(0, roles.cache.size - 1);

    const clientStatus =
      presence?.clientStatus instanceof Object
        ? Object.keys(presence.clientStatus)
        : "offline";
    const userFlags = user.flags.toArray();

    const deviceFilter = clientType.filter((device) =>
      clientStatus.includes(device.name)
    );
    const devices = !Array.isArray(deviceFilter)
      ? new Array(deviceFilter)
      : deviceFilter;

    let Embed = new Discord.EmbedBuilder()
      .setColor(user.hexAccentColor || "Random")
      .setAuthor({
        name: user.tag,
        iconURL: `https://i.imgur.com/${
          statusType[presence?.status || "invisible"]
        }`,
      })
      .setThumbnail(user.avatarURL({ size: 1024 }))
      .setImage(user.bannerURL({ size: 1024 }))
      .addFields(
        { name: "ID", value: `💳 ${user.id}` },
        {
          name: "Activités",
          value:
            presence?.activities
              .map(
                (activity) => `${activityType[activity.type]} ${activity.name}`
              )
              .join("\n") || "None",
        },
        {
          name: "Date d'arrivée",
          value: `🤝🏻 <t:${parseInt(member.joinedTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: "Création du compte",
          value: `📆 <t:${parseInt(user.createdTimestamp / 1000)}:R>`,
          inline: true,
        },
        {
          name: "Surnom",
          value: `🦸🏻‍♀️ ${member.nickname || "None"}`,
          inline: true,
        },
        {
          name: `Roles (${maxDisplayRoles(sortedRoles)} de ${
            sortedRoles.length
          })`,
          value: `${
            sortedRoles.slice(0, maxDisplayRoles(sortedRoles)).join(" ") ||
            "None"
          }`,
        },
        {
          name: `Badges (${userFlags.length})`,
          value: userFlags.length
            ? formatter.format(userFlags.map((flag) => `**${badges[flag]}**`))
            : "None",
        },
        {
          name: `Plateformes`,
          value: devices
            .map((device) => `${device.emoji} ${device.text}`)
            .join("\n"),
          inline: true,
        },
        {
          name: "Couleur du profile",
          value: `🎨 ${user.hexAccentColor || "None"}`,
          inline: true,
        },
        {
          name: "Boost de serveur",
          value: `🏋🏻‍♀️ ${
            roles.premiumSubscriberRole
              ? `Since <t:${parseInt(member.premiumSinceTimestamp / 1000)}:R>`
              : "No"
          }`,
          inline: true,
        },
        { name: "Banner", value: user.bannerURL() ? "** **" : "🎏 None" }
      );
    await message.reply({ embeds: [Embed] });
  },
};
