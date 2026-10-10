const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { buildCustomId } = require("./customId");
const { formatDuration } = require("./estimate");
const { PROFILES, currentProfile, profileLabel } = require("./automodProfiles");

const ACCENT_COLOR = 0xe5484d;
const MAX_EXEMPT_ROLES = 20;
const MAX_EXEMPT_CHANNELS = 25;
const WORDS_PREVIEW = 5;

function id(...params) {
  return buildCustomId("automod-config", ...params);
}

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function button(action, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(id(action))
    .setLabel(label)
    .setStyle(style);
}

function setting(title, details, accessory) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(`**${title}**\n${details}`))
    .setButtonAccessory(accessory);
}

function toggle(action, enabled) {
  return button(
    action,
    enabled ? "Désactiver" : "Activer",
    enabled ? ButtonStyle.Danger : ButtonStyle.Success,
  );
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function describeWords(words) {
  if (words.length === 0) return "Aucun mot interdit";
  const shown = words.slice(0, WORDS_PREVIEW).join(", ");
  const rest = words.length - WORDS_PREVIEW;
  return rest > 0
    ? `${plural(words.length, "mot")} · ${shown} et ${rest} autres`
    : `${plural(words.length, "mot")} · ${shown}`;
}

function describeExemptions({ roles, channels }) {
  if (roles.length + channels.length === 0) return "Aucune exemption";
  return `${plural(roles.length, "rôle")}, ${plural(channels.length, "salon")}`;
}

function describeEscalation(settings) {
  return `Sourdine de ${formatDuration(settings.escalationMinutes)} quand le score atteint le seuil`;
}

function describeContest(settings) {
  if (settings.contestHours === 0) return "Désactivée";
  return `Fenêtre de ${formatDuration(settings.contestHours * 60)}`;
}

function describeSensitivity(settings) {
  if (settings.sensitivity === 0) return "Désactivée";
  return `Sourdine à ${plural(settings.sensitivity, "point")} · points divisés par deux tous les ${plural(settings.halfLifeDays, "jour")}`;
}

function describePoints(settings) {
  return `Mots ${settings.pointsWords} · Spam ${settings.pointsSpam} · Mentions ${settings.pointsMentions}`;
}

function describeHistory(settings) {
  if (settings.updatedBy === null)
    return "-# Réglages par défaut, jamais modifiés";
  const when = Math.floor(settings.updatedAt / 1000);
  return `-# Dernière modification par <@${settings.updatedBy}> <t:${when}:R>`;
}

function profileRow(settings) {
  const current = currentProfile(settings);
  return /** @type {ActionRowBuilder<StringSelectMenuBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("profile"))
      .setPlaceholder(`Profil : ${profileLabel(settings)}`)
      .addOptions(
        Object.entries(PROFILES).map(([key, profile]) => ({
          label: profile.label,
          description: profile.description,
          value: key,
          default: key === current,
        })),
      ),
  );
}

function panel(container) {
  return {
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function renderMainView({ settings, words, exemptions, guild }) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(`## AutoMod — réglages\nServeur ${guild.name}`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(profileRow(settings))
    .addSectionComponents(
      setting(
        "Mots interdits",
        describeWords(words),
        button("words", "Modifier"),
      ),
      setting(
        "Spam",
        settings.spamEnabled ? "Activé" : "Désactivé",
        toggle("spam-toggle", settings.spamEnabled),
      ),
      setting(
        "Mentions de masse",
        settings.mentionsEnabled ? "Activées" : "Désactivées",
        toggle("mentions-toggle", settings.mentionsEnabled),
      ),
      setting(
        "Limite de mentions",
        `${plural(settings.mentionLimit, "mention")} par message`,
        button("mention-limit", "Modifier"),
      ),
      setting(
        "Exemptions",
        describeExemptions(exemptions),
        button("exemptions", "Modifier"),
      ),
      setting(
        "Escalade",
        describeEscalation(settings),
        button("escalation", "Modifier"),
      ),
      setting(
        "Sensibilité",
        describeSensitivity(settings),
        button("sensitivity", "Modifier"),
      ),
      setting(
        "Points par règle",
        describePoints(settings),
        button("points", "Modifier"),
      ),
      setting(
        "Contestation",
        describeContest(settings),
        button("contest", "Modifier"),
      ),
      setting(
        "Logs",
        settings.logChannel ? `<#${settings.logChannel}>` : "Aucun salon",
        button("logs", "Modifier"),
      ),
      setting(
        "Mode observation",
        settings.observation
          ? "Activé : rien n'est bloqué ni sanctionné, les messages sont seulement signalés dans les logs"
          : "Désactivé",
        toggle("observation-toggle", settings.observation),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(describeHistory(settings)));

  return panel(container);
}

function renderExemptionsView({ exemptions }) {
  const roles = new RoleSelectMenuBuilder()
    .setCustomId(id("exempt-roles"))
    .setPlaceholder("Rôles exemptés")
    .setMinValues(0)
    .setMaxValues(MAX_EXEMPT_ROLES)
    .setDefaultRoles(exemptions.roles.slice(0, MAX_EXEMPT_ROLES));
  const channels = new ChannelSelectMenuBuilder()
    .setCustomId(id("exempt-channels"))
    .setPlaceholder("Salons exemptés")
    .setMinValues(0)
    .setMaxValues(MAX_EXEMPT_CHANNELS)
    .setDefaultChannels(exemptions.channels.slice(0, MAX_EXEMPT_CHANNELS));

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        "## Exemptions\nLes membres de ces rôles et les messages de ces salons ne sont jamais bloqués. Désélectionne tout pour retirer les exemptions.",
      ),
    )
    .addActionRowComponents((row) => row.addComponents(roles))
    .addActionRowComponents((row) => row.addComponents(channels))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) =>
      row.addComponents(button("back", "Retour")),
    );

  return panel(container);
}

function renderLogsView({ settings }) {
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId(id("log-channel"))
    .setPlaceholder("Salon de logs")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const clear = button("logs-clear", "Retirer le salon").setDisabled(
    settings.logChannel === null,
  );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## Logs\n${settings.logChannel ? `<#${settings.logChannel}>` : "Aucun salon"}\n-# Les messages bloqués y sont signalés.`,
      ),
    )
    .addActionRowComponents((row) => row.addComponents(channel))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) =>
      row.addComponents(clear, button("back", "Retour")),
    );

  return panel(container);
}

function field(fieldId, value, style = TextInputStyle.Short) {
  return new TextInputBuilder()
    .setCustomId(fieldId)
    .setStyle(style)
    .setValue(String(value));
}

function renderWordsModal({ words }) {
  return new ModalBuilder()
    .setCustomId(id("save-words"))
    .setTitle("Mots interdits")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Mots")
        .setDescription("Un mot ou une expression par ligne. Vide : aucun.")
        .setTextInputComponent(
          field("words", words.join("\n"), TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(4000),
        ),
    );
}

function renderMentionLimitModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-mention-limit"))
    .setTitle("Limite de mentions")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Mentions par message")
        .setDescription("Un message au-dessus de cette limite est bloqué.")
        .setTextInputComponent(
          field("limit", settings.mentionLimit)
            .setRequired(true)
            .setMaxLength(2),
        ),
    );
}

function renderEscalationModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-escalation"))
    .setTitle("Escalade")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Durée de la sourdine (minutes)")
        .setDescription("Jusqu'à 40320 minutes (28 jours).")
        .setTextInputComponent(
          field("minutes", settings.escalationMinutes)
            .setRequired(true)
            .setMaxLength(5),
        ),
    );
}

function renderSensitivityModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-sensitivity"))
    .setTitle("Sensibilité")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Seuil de sourdine (points)")
        .setDescription(
          "Tranquille 10, Standard 6, Strict 3. 0 désactive la sourdine.",
        )
        .setTextInputComponent(
          field("threshold", settings.sensitivity)
            .setRequired(true)
            .setMaxLength(3),
        ),
      new LabelBuilder()
        .setLabel("Demi-vie des points (jours)")
        .setDescription("Le score est divisé par deux tous les N jours.")
        .setTextInputComponent(
          field("halfLife", settings.halfLifeDays)
            .setRequired(true)
            .setMaxLength(2),
        ),
    );
}

function renderPointsModal({ settings }) {
  const label = (title, fieldId, value) =>
    new LabelBuilder()
      .setLabel(title)
      .setTextInputComponent(
        field(fieldId, value).setRequired(true).setMaxLength(2),
      );
  return new ModalBuilder()
    .setCustomId(id("save-points"))
    .setTitle("Points par règle")
    .addLabelComponents(
      label("Mots interdits", "words", settings.pointsWords),
      label("Spam", "spam", settings.pointsSpam),
      label("Mentions de masse", "mentions", settings.pointsMentions),
    );
}

function renderContestModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-contest"))
    .setTitle("Contestation")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Durée de la fenêtre (heures)")
        .setDescription(
          "Le membre bloqué peut contester pendant ce temps. 0 désactive. Jusqu'à 720 heures (30 jours).",
        )
        .setTextInputComponent(
          field("hours", settings.contestHours)
            .setRequired(true)
            .setMaxLength(3),
        ),
    );
}

module.exports = {
  renderMainView,
  renderExemptionsView,
  renderLogsView,
  renderWordsModal,
  renderMentionLimitModal,
  renderEscalationModal,
  renderSensitivityModal,
  renderPointsModal,
  renderContestModal,
};
