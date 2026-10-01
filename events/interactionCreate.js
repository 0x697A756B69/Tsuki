const { MessageFlags } = require("discord.js");

module.exports = async (bot, interaction) => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== "help") return;
    const entry = interaction.options.getFocused();
    const choices = bot.commands
      .filter((cmd) => cmd.name.includes(entry))
      .map((cmd) => ({ name: cmd.name, value: cmd.name }))
      .slice(0, 25);
    return interaction.respond(choices);
  }

  if (!interaction.isChatInputCommand()) return;
  const command = bot.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.run(bot, interaction, interaction.options, bot.db);
  } catch (err) {
    console.error(`[/${interaction.commandName}]`, err);
    const payload = {
      content: "Une erreur est survenue.",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.replied || interaction.deferred)
      await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
};
