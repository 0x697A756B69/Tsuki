const {
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  RoleSelectMenuBuilder,
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
const { rewardRoleFor } = require("./rewards");
const { xpPerMinute, minutesToLevel, formatDuration } = require("./estimate");

const ACCENT_COLOR = 0x7f77dd;
const PREVIEW_LEVEL = 5;
const ESTIMATE_LEVEL = 10;

const MULTIPLIER_PRESETS = [
  { value: 0, label: "Exclure (×0)", description: "Aucune XP" },
  { value: 0.5, label: "×0,5", description: "Moitié moins d'XP" },
  { value: 1, label: "Aucun bonus (×1)", description: "Retire le bonus" },
  { value: 1.25, label: "×1,25" },
  { value: 1.5, label: "×1,5" },
  { value: 2, label: "×2", description: "Double XP" },
];

const MAX_LISTED = 15;

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

function backButton(action) {
  return new ButtonBuilder()
    .setCustomId(id(action))
    .setLabel("Retour")
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

function describeVoice(settings) {
  return settings.voiceEnabled
    ? `Activé · ${settings.voiceXp} XP par minute`
    : "Désactivé";
}

function describeCard(settings) {
  return settings.cardAccent
    ? `Couleur d'accent ${settings.cardAccent}`
    : "Couleur par défaut";
}

function describeHistory(settings) {
  if (settings.updatedBy === null)
    return "-# Réglages par défaut, jamais modifiés";
  const when = Math.floor(settings.updatedAt / 1000);
  return `-# Dernière modification par <@${settings.updatedBy}> <t:${when}:R>`;
}

function formatMultiplier(multiplier) {
  return multiplier === 0 ? "exclu" : `×${multiplier.toLocaleString("fr-FR")}`;
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function describeBonuses(modifiers) {
  const all = [...modifiers.role.values(), ...modifiers.channel.values()];
  if (all.length === 0) return "Aucun bonus";

  const summary = `${plural(modifiers.role.size, "rôle")}, ${plural(modifiers.channel.size, "salon")}`;
  const excluded = all.filter((multiplier) => multiplier === 0).length;
  return excluded > 0
    ? `${summary} · dont ${plural(excluded, "exclusion")}`
    : summary;
}

function describeRewards(rewards) {
  if (rewards.length === 0) return "Aucune récompense";
  const first = rewards[0].level;
  const last = rewards[rewards.length - 1].level;
  const range =
    first === last ? `niveau ${first}` : `niveaux ${first} à ${last}`;
  return `${plural(rewards.length, "rôle")} · ${range}`;
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
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function renderMainView({
  settings,
  modifiers,
  rewards,
  guild,
  viewer,
  rankedMembers,
}) {
  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);
  const top = header(guild, rankedMembers);
  if (top.section) container.addSectionComponents(top.section);
  else container.addTextDisplayComponents(top.text);

  const preview = formatAnnouncement(settings.announceMessage, {
    member: viewer,
    level: PREVIEW_LEVEL,
    role: rewardRoleFor(rewards, PREVIEW_LEVEL) ?? rewards[0]?.role ?? null,
  });

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      setting("Annonces", describeAnnounces(settings), "announce"),
      setting("Message", `> ${preview}`, "message"),
      setting("Gains", describeGains(settings), "gains"),
      setting("Vocal", describeVoice(settings), "voice"),
      setting("Bonus", describeBonuses(modifiers), "bonus"),
      setting("Récompenses", describeRewards(rewards), "rewards"),
      setting("Carte", describeCard(settings), "card"),
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

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(backButton("back")));

  return panel(container);
}

function renderVoiceView({ settings }) {
  const toggle = new ButtonBuilder()
    .setCustomId(id("voice-toggle"))
    .setLabel(settings.voiceEnabled ? "Désactiver" : "Activer")
    .setStyle(settings.voiceEnabled ? ButtonStyle.Danger : ButtonStyle.Success);
  const gain = new ButtonBuilder()
    .setCustomId(id("voice-gain"))
    .setLabel("Changer le gain")
    .setStyle(ButtonStyle.Secondary);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## XP vocal\n${describeVoice(settings)}\n-# Gagné chaque minute en vocal, sauf si tu es muet ou sourd, dans le salon AFK, ou seul. Les bonus et exclusions s'appliquent.`,
      ),
    )
    .addActionRowComponents((row) => row.addComponents(toggle, gain))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(backButton("back")));

  return panel(container);
}

function renderCardView({ settings }) {
  const change = new ButtonBuilder()
    .setCustomId(id("card-accent"))
    .setLabel("Changer la couleur")
    .setStyle(ButtonStyle.Secondary);
  const reset = new ButtonBuilder()
    .setCustomId(id("card-reset"))
    .setLabel("Couleur par défaut")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!settings.cardAccent);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## Carte de rang
${describeCard(settings)}
-# La couleur de la barre d'XP affichée par /rank.`,
      ),
    )
    .addActionRowComponents((row) => row.addComponents(change, reset))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(backButton("back")));

  return panel(container);
}

function listModifiers(entries, mention) {
  const lines = entries
    .slice(0, MAX_LISTED)
    .map(
      ([target, multiplier]) =>
        `${mention(target)} · ${formatMultiplier(multiplier)}`,
    );
  if (entries.length > MAX_LISTED)
    lines.push(`-# et ${entries.length - MAX_LISTED} autres`);
  return lines.join("\n");
}

function renderBonusView({ modifiers }) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text("## Bonus et exclusions\nMultiplient l'XP gagnée. ×0 = aucune XP."),
    );

  const roles = [...modifiers.role];
  const channels = [...modifiers.channel];
  if (roles.length > 0)
    container.addTextDisplayComponents(
      text(`**Rôles**\n${listModifiers(roles, (target) => `<@&${target}>`)}`),
    );
  if (channels.length > 0)
    container.addTextDisplayComponents(
      text(
        `**Salons**\n${listModifiers(channels, (target) => `<#${target}>`)}`,
      ),
    );
  if (roles.length + channels.length === 0)
    container.addTextDisplayComponents(text("-# Aucun bonus pour le moment."));

  const role = new RoleSelectMenuBuilder()
    .setCustomId(id("bonus-role"))
    .setPlaceholder("Ajouter ou modifier un rôle");
  const channel = new ChannelSelectMenuBuilder()
    .setCustomId(id("bonus-channel"))
    .setPlaceholder("Ajouter ou modifier un salon")
    .addChannelTypes(
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildVoice,
      ChannelType.GuildForum,
    );

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(role))
    .addActionRowComponents((row) => row.addComponents(channel))
    .addActionRowComponents((row) => row.addComponents(backButton("back")));

  return panel(container);
}

function renderBonusTargetView({ type, target, multiplier }) {
  const mention = type === "role" ? `<@&${target}>` : `<#${target}>`;
  const current =
    multiplier === 1
      ? "Aucun bonus"
      : `Actuellement ${formatMultiplier(multiplier)}`;

  const presets = new StringSelectMenuBuilder()
    .setCustomId(id("bonus-set", type, target))
    .addOptions(
      MULTIPLIER_PRESETS.map((preset) => ({
        ...preset,
        value: String(preset.value),
        default: preset.value === multiplier,
      })),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(text(`## Bonus pour ${mention}\n${current}`))
    .addActionRowComponents((row) => row.addComponents(presets))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(backButton("bonus")));

  return panel(container);
}

function renderRewardsView({ rewards }) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        "## Rôles récompenses\nUn membre reçoit le rôle du plus haut niveau atteint, qui remplace le précédent.",
      ),
    );

  if (rewards.length > 0)
    container.addTextDisplayComponents(
      text(
        rewards
          .slice(0, MAX_LISTED)
          .map(({ level, role }) => `Niveau ${level} · <@&${role}>`)
          .join("\n") +
          (rewards.length > MAX_LISTED
            ? `\n-# et ${rewards.length - MAX_LISTED} autres`
            : ""),
      ),
    );
  else
    container.addTextDisplayComponents(
      text("-# Aucune récompense pour le moment."),
    );

  const role = new RoleSelectMenuBuilder()
    .setCustomId(id("reward-role"))
    .setPlaceholder("Ajouter ou modifier un rôle");

  const resync = new ButtonBuilder()
    .setCustomId(id("resync"))
    .setLabel("Resynchroniser les rôles")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(rewards.length === 0);

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(role))
    .addActionRowComponents((row) =>
      row.addComponents(resync, backButton("back")),
    );

  return panel(container);
}

function renderRewardView({ role, level }) {
  const change = new ButtonBuilder()
    .setCustomId(id("reward-level", role))
    .setLabel("Changer le niveau")
    .setStyle(ButtonStyle.Secondary);
  const remove = new ButtonBuilder()
    .setCustomId(id("reward-remove", role))
    .setLabel("Retirer la récompense")
    .setStyle(ButtonStyle.Danger);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(`## Récompense <@&${role}>\nDonné au niveau ${level}`),
    )
    .addActionRowComponents((row) => row.addComponents(change, remove))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(backButton("rewards")));

  return panel(container);
}

function renderResyncConfirm() {
  const confirm = new ButtonBuilder()
    .setCustomId(id("resync-confirm"))
    .setLabel("Confirmer")
    .setStyle(ButtonStyle.Primary);
  const cancel = new ButtonBuilder()
    .setCustomId(id("rewards"))
    .setLabel("Annuler")
    .setStyle(ButtonStyle.Secondary);

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        "## Resynchroniser les rôles\nLe rôle récompense de chaque membre sera recalculé d'après son XP total. Cela peut prendre un moment sur un gros serveur.",
      ),
    )
    .addActionRowComponents((row) => row.addComponents(confirm, cancel));

  return panel(container);
}

function renderResyncProgress() {
  return panel(
    new ContainerBuilder()
      .setAccentColor(ACCENT_COLOR)
      .addTextDisplayComponents(
        text("## Resynchronisation en cours…\n-# Les rôles sont recalculés."),
      ),
  );
}

function renderResyncReport({ checked, fixed, failed }) {
  const lines = [
    `${plural(checked, "membre")} ${checked > 1 ? "vérifiés" : "vérifié"}, ${fixed} ${fixed > 1 ? "corrigés" : "corrigé"}`,
  ];
  if (failed > 0)
    lines.push(
      `-# ${plural(failed, "échec")} : vérifie que mon rôle est au-dessus des rôles récompenses.`,
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(`## Rôles resynchronisés\n${lines.join("\n")}`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents((row) => row.addComponents(backButton("rewards")));

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
          "{membre}, {niveau} et {role} (le rôle gagné) seront remplacés automatiquement.",
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

function renderVoiceModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-voice-gain"))
    .setTitle("Gain d'XP vocal")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("XP par minute en vocal")
        .setTextInputComponent(input("gain", settings.voiceXp).setMaxLength(4)),
    );
}

function renderCardModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-card-accent"))
    .setTitle("Couleur de la carte")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Couleur hexadécimale")
        .setDescription("Par exemple #ff8800.")
        .setTextInputComponent(
          input("accent", settings.cardAccent ?? "#7d8aa8").setMaxLength(7),
        ),
    );
}

function renderRewardModal({ role, level }) {
  const field = new TextInputBuilder()
    .setCustomId("level")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3);
  if (level !== null) field.setValue(String(level));

  return new ModalBuilder()
    .setCustomId(id("save-reward", role))
    .setTitle("Niveau de la récompense")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Niveau")
        .setDescription("Le rôle est donné dès ce niveau.")
        .setTextInputComponent(field),
    );
}

module.exports = {
  ANNOUNCE_MODES,
  MULTIPLIER_PRESETS,
  renderMainView,
  renderAnnounceView,
  renderBonusView,
  renderBonusTargetView,
  renderVoiceView,
  renderCardView,
  renderRewardsView,
  renderRewardView,
  renderResyncConfirm,
  renderResyncProgress,
  renderResyncReport,
  renderMessageModal,
  renderGainsModal,
  renderVoiceModal,
  renderCardModal,
  renderRewardModal,
};
