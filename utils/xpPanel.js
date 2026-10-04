const {
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { buildCustomId } = require("./customId");
const { formatAnnouncement } = require("./announce");
const { xpPerMinute, minutesToLevel, formatDuration } = require("./estimate");

const ACCENT_COLOR = 0x7f77dd;
const PREVIEW_LEVEL = 5;
const ESTIMATE_LEVEL = 10;

const ANNOUNCE_MODES = [
  {
    value: "channel",
    label: "Salon dédié",
    description: "Toutes les annonces dans un même salon",
  },
  {
    value: "current",
    label: "Salon du message",
    description: "Là où le membre vient d'écrire",
  },
  {
    value: "dm",
    label: "Message privé",
    description: "Seul le membre voit l'annonce",
  },
  { value: "off", label: "Désactivées", description: "Aucune annonce" },
];

function id(...params) {
  return buildCustomId("xp-config", ...params);
}

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function editButton(action) {
  return new ButtonBuilder()
    .setCustomId(id(action))
    .setLabel("Modifier")
    .setStyle(ButtonStyle.Secondary);
}

function setting(title, details, action) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(`**${title}**\n${details}`))
    .setButtonAccessory(editButton(action));
}

function describeAnnounces(settings) {
  const { label } = ANNOUNCE_MODES.find(
    (mode) => mode.value === settings.announceMode,
  );
  return settings.announceMode === "channel"
    ? `${label} · <#${settings.announceChannel}>`
    : label;
}

function describeGains(settings) {
  const speed = Math.round(xpPerMinute(settings));
  const time = formatDuration(minutesToLevel(settings, ESTIMATE_LEVEL));
  return (
    `${settings.xpMin} à ${settings.xpMax} XP par message · toutes les ${settings.cooldown} s\n` +
    `-# Environ ${speed} XP par minute active · niveau ${ESTIMATE_LEVEL} en ${time}`
  );
}

function describeHistory(settings) {
  if (settings.updatedBy === null)
    return "-# Réglages par défaut, jamais modifiés";
  const when = Math.floor(settings.updatedAt / 1000);
  return `-# Dernière modification par <@${settings.updatedBy}> <t:${when}:R>`;
}

function header(guild, rankedMembers) {
  const title = text(
    `## Niveaux — réglages\nServeur ${guild.name} · ${rankedMembers} membres classés`,
  );
  const icon = guild.iconURL({ size: 128 });
  if (!icon) return { text: title };
  return {
    section: new SectionBuilder()
      .addTextDisplayComponents(title)
      .setThumbnailAccessory((thumbnail) => thumbnail.setURL(icon)),
  };
}

function panel(container) {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function renderMainView({ settings, guild, viewer, rankedMembers }) {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);
  const top = header(guild, rankedMembers);
  if (top.section) container.addSectionComponents(top.section);
  else container.addTextDisplayComponents(top.text);

  const preview = formatAnnouncement(settings.announceMessage, {
    member: viewer,
    level: PREVIEW_LEVEL,
  });

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      setting("Annonces", describeAnnounces(settings), "announce"),
      setting("Message", `> ${preview}`, "message"),
      setting("Gains", describeGains(settings), "gains"),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(describeHistory(settings)));

  return panel(container);
}

function renderAnnounceView({ settings }) {
  const modes = new StringSelectMenuBuilder()
    .setCustomId(id("mode"))
    .addOptions(
      ANNOUNCE_MODES.map((mode) => ({
        ...mode,
        default: mode.value === settings.announceMode,
      })),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        "## Annonces de niveau\nChoisis où annoncer les passages de niveau.",
      ),
    )
    .addActionRowComponents((row) => row.addComponents(modes));

  if (settings.announceMode === "channel") {
    const channel = new ChannelSelectMenuBuilder()
      .setCustomId(id("channel"))
      .setPlaceholder("Choisis le salon des annonces")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    if (settings.announceChannel)
      channel.setDefaultChannels(settings.announceChannel);

    container
      .addTextDisplayComponents(text("**Salon dédié**"))
      .addActionRowComponents((row) => row.addComponents(channel));
  }

  const back = new ButtonBuilder()
    .setCustomId(id("back"))
    .setLabel("Retour")
    .setStyle(ButtonStyle.Secondary);

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(back));

  return panel(container);
}

function input(fieldId, value, style = TextInputStyle.Short) {
  return new TextInputBuilder()
    .setCustomId(fieldId)
    .setStyle(style)
    .setValue(String(value))
    .setRequired(true);
}

function renderMessageModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-message"))
    .setTitle("Message d'annonce")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Message")
        .setDescription(
          "{membre} et {niveau} seront remplacés automatiquement.",
        )
        .setTextInputComponent(
          input(
            "message",
            settings.announceMessage,
            TextInputStyle.Paragraph,
          ).setMaxLength(500),
        ),
    );
}

function renderGainsModal({ settings }) {
  const field = (label, fieldId, value) =>
    new LabelBuilder()
      .setLabel(label)
      .setTextInputComponent(input(fieldId, value).setMaxLength(4));

  return new ModalBuilder()
    .setCustomId(id("save-gains"))
    .setTitle("Gains d'XP")
    .addLabelComponents(
      field("XP minimum par message", "min", settings.xpMin),
      field("XP maximum par message", "max", settings.xpMax),
      field("Cooldown en secondes", "cooldown", settings.cooldown),
    );
}

module.exports = {
  ANNOUNCE_MODES,
  renderMainView,
  renderAnnounceView,
  renderMessageModal,
  renderGainsModal,
};
