const Discord = require("discord.js");
const Canvas = require("discord-canvas");

module.exports = {
  name: "rank",
  description:
    "afficher votre carte de rang de serveur ou celle de quelqu'un d'autre.",
  permission: "Aucune",
  dm: false,
  category: "Expérience",
  options: [
    {
      type: "user",
      name: "membre",
      description: "Le membre à afficher.",
      required: true,
    },
  ],

  async run(bot, message, args, db) {
    let user;
    if (args.getUser("membre")) {
      user = args.getUser("membre");
      if (!user || !message.guild.members.cache.get(user?.id))
        return message.replay({ content: "Pas de membre !", ephmeral: true });
    } else user = message.user;

    db.query(
      `SELECT * FROM xp WHERE guild = '${message.guildId}' AND user = '${user.id}'`,
      async (err, req) => {
        db.query(
          `SELECT * FROM xp WHERE guild = '${message.guildId}'`,
          async (err, all) => {
            if (req.length < 1)
              return message.reply({
                content: "Ce membre n'a pas encore de l'expérience !",
                ephmeral: true,
              });

            await message.deferReply();

            const calculXp = (xp, level) => {
              let xptotal = 0;
              for (i = 0; i < level + 1; i++) xptotal += i * 1000;
              xptotal += xp;
              return xptotal;
            };

            let leaderboard = await all.sort(async (a, b) =>
              calculXp(
                parseInt(b.xp),
                parseInt(b.level) - calculXp(parseInt(a.xp), parseInt(a.level))
              )
            );

            var min = 1;
            var max = 25;
            var reputation = Math.floor(Math.random() * (max - min)) + min;
            let level = parseInt(req[0].level);
            let xp = parseInt(req[0].xp);
            let rank = leaderboard.findIndex((r) => r.user === user.id) + 1;
            let need = (level + 1) * 1000;

            let Card = await new Canvas.RankCard()
              .setBackground(
                "https://i.pinimg.com/originals/ac/96/80/ac9680c31e6962428ea4ea48a9cb2588.jpg"
              )
              .setAvatar(user.displayAvatarURL({ extension: "jpg" }))
              .setUsername(user.tag)
              .setReputation(reputation)
              .setXP("current", xp)
              .setXP("needed", need)
              .setRank(rank)
              .setText("pour passer au prochain niveau")
              .setRankName("your rank card")
              .toAttachment();

            await message.followUp({
              files: [
                new Discord.AttachmentBuilder(Card.toBuffer(), {
                  name: "rank.png",
                }),
              ],
            });
          }
        );
      }
    );
  },
};
