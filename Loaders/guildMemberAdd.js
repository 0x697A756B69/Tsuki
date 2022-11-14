const Discord = require("discord.js");
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = (client, member, args) => {
  const EmbedMessage = new EmbedBuilder()
    .setTitle(`Un membre a fait apparition !`)
    .setColor("#2f3136")
    .setDescription(
      `
      Bienvenue à ${user} ! 
      ± Nom d'utilisateur: ${member}± Créé le: <t:${parseInt(
        member.user.createdTimestamp / 1000
      )}:f> (<t:${parseInt(
        member.user.createdTimestamp / 1000
      )}:R>)± Rejoint le: <t:${parseInt(
        member.joinedTimestamp / 1000
      )}:f> (<t:${parseInt(member.joinedTimestamp / 1000)}:R>)`
    )
    .setTimestamp();

  client.channel.send
    .get("1003566871011917926")
    .send({ embeds: [EmbedMessage], components: [row] });
};
