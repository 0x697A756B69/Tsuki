const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} = require("discord.js");
const { buildCustomId } = require("./core/customId");
const { closedDmLine } = require("./moderationNotice");

const ACCENT_COLOR = 0x7f77dd;
const PAGE_SIZE = 10;
const MAX_REASON = 100;
const COMPONENT_ID = "warnlist";

const LIFTED_TEXT = {
  timeout: "Sourdine levée.",
  ban: "Bannissement levé.",
};

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

function pageItems(warnings, page) {
  const start = clampPage(page, warnings.length) * PAGE_SIZE;
  return warnings.slice(start, start + PAGE_SIZE);
}

function maskOf(indexes) {
  return indexes.reduce((mask, index) => mask | (1 << Number(index)), 0);
}

function pickWarnings(warnings, page, mask) {
  return pageItems(warnings, page).filter((_, index) => (mask >> index) & 1);
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

function removeRow(userId, page, authorId, shown) {
  return /** @type {ActionRowBuilder<StringSelectMenuBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(
        buildCustomId(COMPONENT_ID, "select", userId, page, authorId),
      )
      .setPlaceholder("Retirer des avertissements…")
      .setMinValues(1)
      .setMaxValues(shown.length)
      .addOptions(
        shown.map((warning, index) => ({
          label: warning.id,
          description: truncate(warning.reason),
          value: String(index),
        })),
      ),
  );
}

function purgeRow(userId, page, authorId) {
  return /** @type {ActionRowBuilder<ButtonBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId(COMPONENT_ID, "purge", userId, page, authorId))
      .setLabel("Tout purger")
      .setStyle(ButtonStyle.Danger),
  );
}

function payload(container) {
  return {
    components: [container],
    flags: /** @type {MessageFlags.IsComponentsV2} */ (
      MessageFlags.IsComponentsV2
    ),
    allowedMentions: { parse: [] },
  };
}

function warnlistView({ user, warnings, page, authorId }) {
  const current = clampPage(page, warnings.length);
  const pages = pageCount(warnings.length);
  const active = warnings.filter((warning) => warning.active).length;
  const shown = pageItems(warnings, current);

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
  if (shown.length > 0)
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(removeRow(user.id, current, authorId, shown));
  if (pages > 1)
    container.addActionRowComponents(
      pagerRow(user.id, current, pages, authorId),
    );
  if (warnings.length > 0)
    container.addActionRowComponents(purgeRow(user.id, current, authorId));

  return payload(container);
}

function removalView({ user, selected, page, mask, total, authorId }) {
  const count = selected.length;
  const confirm = new ButtonBuilder()
    .setCustomId(
      buildCustomId(COMPONENT_ID, "ok", user.id, page, authorId, mask, total),
    )
    .setLabel("Confirmer")
    .setStyle(ButtonStyle.Danger);
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## Retirer ${count} avertissement${count > 1 ? "s" : ""} ?\n-# ${selected.map((warning) => warning.id).join(", ")}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        "Les sanctions posées par Tsuki sont levées si elles sont encore en cours. Les paliers sont recalculés.",
      ),
    )
    .addActionRowComponents(
      /** @type {ActionRowBuilder<ButtonBuilder>} */ (
        new ActionRowBuilder()
      ).addComponents(
        confirm,
        pageButton("Annuler", user.id, page, authorId, false),
      ),
    );
  return payload(container);
}

function removedView({ user, count, lifted, delivered, page, authorId }) {
  const lines = [...new Set(lifted)]
    .filter((target) => LIFTED_TEXT[target])
    .map((target) => LIFTED_TEXT[target]);
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## ${count} avertissement${count > 1 ? "s" : ""} retiré${count > 1 ? "s" : ""}\n${[`Pour ${user.tag}.`, ...lines].join("\n")}${closedDmLine(delivered)}`,
      ),
    )
    .addActionRowComponents(
      /** @type {ActionRowBuilder<ButtonBuilder>} */ (
        new ActionRowBuilder()
      ).addComponents(
        pageButton("Retour à la liste", user.id, page, authorId, false),
      ),
    );
  return payload(container);
}

function purgeView({ user, total, page, authorId }) {
  const confirm = new ButtonBuilder()
    .setCustomId(
      buildCustomId(COMPONENT_ID, "purgeok", user.id, page, authorId, 0, total),
    )
    .setLabel("Tout purger")
    .setStyle(ButtonStyle.Danger);
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## Purger les ${total} avertissement${total > 1 ? "s" : ""} ?\n-# ${user.tag}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      text(
        "Tous les avertissements sont supprimés, expirés compris. Les sanctions posées par Tsuki sont levées si elles sont encore en cours. Une expulsion déjà exécutée ne s'annule pas.",
      ),
    )
    .addActionRowComponents(
      /** @type {ActionRowBuilder<ButtonBuilder>} */ (
        new ActionRowBuilder()
      ).addComponents(
        confirm,
        pageButton("Annuler", user.id, page, authorId, false),
      ),
    );
  return payload(container);
}

function purgedView({ user, purged, lifted, delivered, page, authorId }) {
  const count = purged.length;
  const kicks = purged.filter((warning) => warning.sanction === "kick").length;
  const lines = [...new Set(lifted)]
    .filter((target) => LIFTED_TEXT[target])
    .map((target) => LIFTED_TEXT[target]);
  if (kicks > 0)
    lines.push(
      `${kicks} expulsion${kicks > 1 ? "s" : ""} déjà exécutée${kicks > 1 ? "s" : ""}, non annulable${kicks > 1 ? "s" : ""}.`,
    );
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## ${count} avertissement${count > 1 ? "s" : ""} purgé${count > 1 ? "s" : ""}\n${[`Pour ${user.tag}.`, ...lines].join("\n")}${closedDmLine(delivered)}`,
      ),
    )
    .addActionRowComponents(
      /** @type {ActionRowBuilder<ButtonBuilder>} */ (
        new ActionRowBuilder()
      ).addComponents(
        pageButton("Retour à la liste", user.id, page, authorId, false),
      ),
    );
  return payload(container);
}

module.exports = {
  ACCENT_COLOR,
  PAGE_SIZE,
  COMPONENT_ID,
  pageCount,
  clampPage,
  maskOf,
  pickWarnings,
  sanctionText,
  warningText,
  warnlistView,
  removalView,
  removedView,
  purgeView,
  purgedView,
};
