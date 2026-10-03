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

function addSubcommand(builder, subcommand) {
  return builder.addSubcommand((s) => {
    s.setName(subcommand.name).setDescription(subcommand.description);
    for (const option of subcommand.options ?? []) addOption(s, option);
    return s;
  });
}

function addGroup(builder, group) {
  return builder.addSubcommandGroup((g) => {
    g.setName(group.name).setDescription(group.description);
    for (const subcommand of group.subcommands.values())
      addSubcommand(g, subcommand);
    return g;
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
    for (const subcommand of command.subcommands?.values() ?? [])
      addSubcommand(builder, subcommand);
    for (const group of command.groups?.values() ?? [])
      addGroup(builder, group);
    return builder.toJSON();
  });
