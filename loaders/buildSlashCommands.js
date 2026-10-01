const { InteractionContextType, SlashCommandBuilder } = require("discord.js");

function addOption(builder, option) {
  const method = `add${option.type[0].toUpperCase()}${option.type.slice(1)}Option`;
  return builder[method]((o) => {
    o.setName(option.name)
      .setDescription(option.description)
      .setRequired(option.required ?? false);
    if (option.autocomplete) o.setAutocomplete(true);
    return o;
  });
}

module.exports = (commands) =>
  commands.map((command) => {
    const builder = new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(command.description)
      .setDefaultMemberPermissions(
        command.permission === "Aucune" ? null : command.permission,
      );
    if (command.dm)
      builder.setContexts(
        InteractionContextType.Guild,
        InteractionContextType.BotDM,
      );
    for (const option of command.options ?? []) addOption(builder, option);
    return builder.toJSON();
  });
