const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { buildCustomId } = require("./customId");

const ACCENT_COLOR = 0x7f77dd;
const PAGE_SIZE = 10;
const MAX_REASON = 100;
const COMPONENT_ID = "warnlist";

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function pageCount(total) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function clampPage(page, total) {
  return Math.min(Math.max(0, page), pageCount(total) - 1);
}

function stamp(date, style) {
  return `<t:${Math.floor(date / 1000)}:${style}>`;
}

function truncate(reason) {
  return reason.length > MAX_REASON
    ? `${reason.slice(0, MAX_REASON - 1)}…`
    : reason;
}

function sanctionText(warning) {
  if (warning.sanction === "timeout")
    return warning.timeoutUntil === null
      ? "Sourdine"
      : `Sourdine jusqu'au ${stamp(warning.timeoutUntil, "f")}`;
  if (warning.sanction === "kick") return "Expulsion";
  if (warning.sanction === "ban") return "Bannissement";
  return "Aucune sanction";
}

function warningText(warning) {
  const state = warning.active ? "actif" : "expiré";
  const expiry =
    warning.active && warning.expiresAt !== null
      ? ` · expire le ${stamp(warning.expiresAt, "D")}`
      : "";
  return [
    `**${warning.id}** · ${state}`,
    `${truncate(warning.reason)} · par <@${warning.author}> · ${stamp(warning.date, "f")}`,
    `${sanctionText(warning)}${expiry}`,
  ].join("\n");
}

function pageButton(label, userId, page, authorId, disabled) {
  return new ButtonBuilder()
    .setCustomId(buildCustomId(COMPONENT_ID, "page", userId, page, authorId))
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

function pagerRow(userId, page, pages, authorId) {
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    pageButton("Précédent", userId, page - 1, authorId, page === 0),
    new ButtonBuilder()
      .setCustomId(buildCustomId(COMPONENT_ID, "label"))
      .setLabel(`Page ${page + 1} / ${pages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    pageButton("Suivant", userId, page + 1, authorId, page === pages - 1),
  );
}

function warnlistView({ user, warnings, page, authorId }) {
  const current = clampPage(page, warnings.length);
  const pages = pageCount(warnings.length);
  const active = warnings.filter((warning) => warning.active).length;
  const shown = warnings.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );

  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);
  container.addTextDisplayComponents(
    text(
      `## Avertissements de ${user.tag}\n-# ${active} actif${active > 1 ? "s" : ""} sur ${warnings.length}`,
    ),
  );
  for (const warning of shown)
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(text(warningText(warning)));
  if (pages > 1)
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(pagerRow(user.id, current, pages, authorId));

  return {
    components: [container],
    flags: /** @type {MessageFlags.IsComponentsV2} */ (
      MessageFlags.IsComponentsV2
    ),
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  ACCENT_COLOR,
  PAGE_SIZE,
  COMPONENT_ID,
  pageCount,
  clampPage,
  sanctionText,
  warningText,
  warnlistView,
};
