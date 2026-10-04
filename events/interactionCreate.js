const { MessageFlags } = require("discord.js");
const { parseCustomId } = require("../utils/customId");

async function reply(interaction, content) {
  const payload = { content, flags: MessageFlags.Ephemeral };
  if (interaction.replied || interaction.deferred)
    await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
}

async function safely(interaction, label, run) {
  try {
    await run();
  } catch (err) {
    console.error(`[${label}]`, err);
    await reply(interaction, "Une erreur est survenue.");
  }
}

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

  if (interaction.isChatInputCommand()) {
    const command = bot.commands.get(interaction.commandName);
    if (!command) return;
    return safely(interaction, `/${interaction.commandName}`, () =>
      command.run(bot, interaction, interaction.options, bot.db),
    );
  }

  if (interaction.isMessageComponent()) {
    const { id, params } = parseCustomId(interaction.customId);
    const component = bot.components.get(id);
    if (!component) return reply(interaction, "Ce bouton n'est plus actif.");
    return safely(interaction, `component ${id}`, () =>
      component.run(bot, interaction, params, bot.db),
    );
  }
};
