const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  LabelBuilder,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { buildCustomId } = require("./customId");
const { SIGNAL_LABELS } = require("./joinSignals");
const { enabledSignals } = require("./raidConfig");

const ACCENT_COLOR = 0xe5484d;
const CONFIG_ID = "raid-config";
const ACTION_OPTIONS = [
  { label: "Journal seul", value: "log" },
  { label: "Sourdine", value: "timeout" },
  { label: "Sas", value: "quarantine" },
  { label: "Expulsion", value: "kick" },
  { label: "Bannissement", value: "ban" },
];
const LOCKDOWN_OPTIONS = [
  { label: "Aucun verrouillage", value: "off" },
  { label: "Pause des invitations", value: "invites" },
  { label: "Vérification maximale", value: "verification" },
];
const TIER_LABELS = {
  watch: "Vigilance",
  alert: "Alerte",
  raid: "Raid",
};

function id(...params) {
  return buildCustomId(CONFIG_ID, ...params);
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

function row(...items) {
  return /** @type {ActionRowBuilder<any>} */ (
    new ActionRowBuilder()
  ).addComponents(...items);
}

function panel(container) {
  return { components: [container] };
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? "s" : ""}`;
}

function describeThresholds(settings) {
  return `${plural(settings.windowMinutes, "minute")} de fenêtre · Vigilance à ${settings.watchJoins}, Alerte à ${settings.alertJoins}, Raid à ${settings.raidJoins} arrivées · retour au calme après ${plural(settings.calmMinutes, "minute")} · compte récent : moins de ${plural(settings.accountDays, "jour")}`;
}

function actionSelect(tier, settings, key) {
  return new StringSelectMenuBuilder()
    .setCustomId(id(`${tier}-action`))
    .setPlaceholder(`${TIER_LABELS[tier]}`)
    .addOptions(
      ACTION_OPTIONS.map((option) => ({
        ...option,
        label: `${TIER_LABELS[tier]} : ${option.label}`,
        default: settings[key] === option.value,
      })),
    );
}

function renderRaidView({ settings, logChannel }) {
  const signals = enabledSignals(settings);
  const select = new StringSelectMenuBuilder()
    .setCustomId(id("signals"))
    .setPlaceholder("Signaux de compte suspect")
    .setMinValues(0)
    .setMaxValues(Object.keys(SIGNAL_LABELS).length)
    .addOptions(
      Object.entries(SIGNAL_LABELS).map(([value, label]) => ({
        label,
        value,
        default: signals.includes(value),
      })),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## Anti-raid\nSurveille les arrivées et réagit quand trop de comptes arrivent d'un coup.\n${logChannel ? `Alertes dans <#${logChannel}>` : "-# Aucun salon de logs : définis-en un dans les réglages AutoMod."}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      setting(
        "Détection",
        settings.enabled ? "Activée" : "Désactivée",
        toggle("enabled-toggle", settings.enabled),
      ),
      setting(
        "Observation",
        settings.observation
          ? "Activée : les sanctions sont seulement indiquées, jamais appliquées."
          : "Désactivée : les actions choisies sont appliquées.",
        toggle("observation-toggle", settings.observation),
      ),
      setting(
        "Portée",
        settings.scope === "all"
          ? "Tous les comptes comptent dans les seuils."
          : "Seuls les comptes suspects comptent dans les seuils.",
        button("scope-toggle", "Changer"),
      ),
      setting(
        "Seuils",
        describeThresholds(settings),
        button("thresholds", "Modifier"),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row(select))
    .addActionRowComponents(
      row(button("response", "Réponses"), buildBackButton()),
    );

  return panel(container);
}

function buildBackButton() {
  return new ButtonBuilder()
    .setCustomId(buildCustomId("automod-config", "back"))
    .setLabel("Retour à l'accueil")
    .setStyle(ButtonStyle.Secondary);
}

function renderRaidResponseView({ settings }) {
  const lockdown = new StringSelectMenuBuilder()
    .setCustomId(id("lockdown"))
    .setPlaceholder("Verrouillage")
    .addOptions(
      LOCKDOWN_OPTIONS.map((option) => ({
        ...option,
        label: `Raid : ${option.label}`,
        default: settings.lockdown === option.value,
      })),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(
        `## Réponses au raid\nChaque palier a sa réaction. La sourdine dure ${plural(settings.timeoutMinutes, "minute")}.\n${settings.quarantineRole ? `Sas : <@&${settings.quarantineRole}>` : "-# Le sas est créé au premier usage."}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      row(actionSelect("watch", settings, "watchAction")),
      row(actionSelect("alert", settings, "alertAction")),
      row(actionSelect("raid", settings, "raidAction")),
      row(lockdown),
      row(
        button("timeout", "Durée de sourdine"),
        button("raid", "Retour à l'anti-raid"),
      ),
    );

  return panel(container);
}

function field(fieldId, value) {
  return new TextInputBuilder()
    .setCustomId(fieldId)
    .setStyle(TextInputStyle.Short)
    .setValue(String(value))
    .setRequired(true);
}

function label(title, description, input) {
  return new LabelBuilder()
    .setLabel(title)
    .setDescription(description)
    .setTextInputComponent(input);
}

function renderThresholdsModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-thresholds"))
    .setTitle("Seuils anti-raid")
    .addLabelComponents(
      label(
        "Fenêtre (minutes)",
        "Période sur laquelle les arrivées sont comptées.",
        field("window", settings.windowMinutes).setMaxLength(2),
      ),
      label(
        "Vigilance / Alerte / Raid",
        "Nombre d'arrivées pour chaque palier, par exemple 5 / 8 / 10.",
        field(
          "thresholds",
          `${settings.watchJoins} / ${settings.alertJoins} / ${settings.raidJoins}`,
        ).setMaxLength(20),
      ),
      label(
        "Retour au calme (minutes)",
        "Temps sans afflux avant de redescendre d'un palier.",
        field("calm", settings.calmMinutes).setMaxLength(4),
      ),
      label(
        "Compte récent (jours)",
        "Un compte plus jeune compte comme récent.",
        field("accountDays", settings.accountDays).setMaxLength(3),
      ),
    );
}

function renderTimeoutModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-timeout"))
    .setTitle("Durée de sourdine")
    .addLabelComponents(
      label(
        "Durée (minutes)",
        "Jusqu'à 40320 minutes, soit 28 jours.",
        field("minutes", settings.timeoutMinutes).setMaxLength(5),
      ),
    );
}

module.exports = {
  ACTION_OPTIONS,
  CONFIG_ID,
  LOCKDOWN_OPTIONS,
  renderRaidResponseView,
  renderRaidView,
  renderThresholdsModal,
  renderTimeoutModal,
};
