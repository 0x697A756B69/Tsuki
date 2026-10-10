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
const { describeStep } = require("./warnLadder");

const ACCENT_COLOR = 0xe5484d;
const MAX_EXEMPT_ROLES = 20;
const MAX_EXEMPT_CHANNELS = 25;
const WORDS_PREVIEW = 5;
const WIKI = [
  "**Blocage** : un message qui enfreint une règle est bloqué, et son auteur reçoit un avertissement.",
  "**Paliers** : plus un membre a d'avertissements actifs, plus la sanction est lourde.",
  "**Contestation** : un membre bloqué peut contester ; un avertissement retiré retire aussi sa sanction.",
].join("\n");
const HOME_SECTIONS = [
  {
    label: "Règles",
    value: "rules",
    description: "Mots interdits, spam, mentions",
  },
  {
    label: "Raisons",
    value: "reasons",
    description: "Motifs proposés et motif de chaque règle",
  },
  {
    label: "Paliers",
    value: "ladder",
    description: "Sanction selon le nombre d'avertissements",
  },
  {
    label: "Durée",
    value: "validity",
    description: "Combien de temps compte un avertissement",
  },
  {
    label: "Contestation",
    value: "contest",
    description: "Fenêtre pour contester un blocage",
  },
  {
    label: "Justice",
    value: "justice",
    description: "Salons privés pour contester un blocage",
  },
  {
    label: "Logs",
    value: "logs",
    description: "Salon où les blocages sont signalés",
  },
  {
    label: "Mode observation",
    value: "observation",
    description: "Signaler sans bloquer",
  },
  {
    label: "Exemptions",
    value: "exemptions",
    description: "Rôles et salons jamais bloqués",
  },
];

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

function describeContest(settings) {
  if (settings.contestHours === 0) return "Désactivée";
  return `Fenêtre de ${formatDuration(settings.contestHours * 60)}`;
}

function describeHistory(settings) {
  if (settings.updatedBy === null)
    return "-# Réglages par défaut, jamais modifiés";
  const when = Math.floor(settings.updatedAt / 1000);
  return `-# Dernière modification par <@${settings.updatedBy}> <t:${when}:R>`;
}

function panel(container) {
  return {
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function describeValidity(settings) {
  if (settings.warnValidDays === 0)
    return "Les avertissements n'expirent jamais";
  return `Un avertissement compte pendant ${formatDuration(settings.warnValidDays * 1440)}`;
}

function describeLadder(ladder) {
  return ladder
    .map((step, index) => {
      const label =
        index === ladder.length - 1
          ? `${plural(step.warns, "avertissement")} et plus`
          : plural(step.warns, "avertissement");
      return `${label} : ${describeStep(step)}`;
    })
    .join("\n");
}

function homeSelect() {
  return /** @type {ActionRowBuilder<StringSelectMenuBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id("goto"))
      .setPlaceholder("Aller à un réglage…")
      .addOptions(HOME_SECTIONS),
  );
}

function section(title, intro) {
  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(text(`## ${title}\n${intro}`));
}

function buttons(...items) {
  return (row) => row.addComponents(...items);
}

function backButton() {
  return button("back", "Retour à l'accueil");
}

function renderMainView({ settings, guild }) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(
      text(`## AutoMod — réglages\nServeur ${guild.name}`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(WIKI))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(homeSelect())
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(text(describeHistory(settings)));

  return panel(container);
}

function renderRulesView({ settings, words }) {
  const container = section(
    "Règles",
    "Un message qui enfreint une règle est bloqué et son auteur reçoit un avertissement.",
  )
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
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(buttons(backButton()));

  return panel(container);
}

function reasonSelect(key, title, current, reasons) {
  return /** @type {ActionRowBuilder<StringSelectMenuBuilder>} */ (
    new ActionRowBuilder()
  ).addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(id(`reason-${key}`))
      .setPlaceholder(`${title} : ${current}`)
      .addOptions(
        reasons.map((reason) => ({
          label: reason,
          value: reason,
          default: reason === current,
        })),
      ),
  );
}

function renderReasonsView({ settings, reasons }) {
  const container = section(
    "Raisons",
    `Les raisons proposées par \`/warn\`, avec « Autre » pour une raison libre. Chaque règle a la sienne.\n${reasons.join(" · ")}`,
  )
    .addActionRowComponents(
      reasonSelect("words", "Mots interdits", settings.reasonWords, reasons),
    )
    .addActionRowComponents(
      reasonSelect("spam", "Spam", settings.reasonSpam, reasons),
    )
    .addActionRowComponents(
      reasonSelect(
        "mentions",
        "Mentions de masse",
        settings.reasonMentions,
        reasons,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      buttons(
        button("reasons-edit", "Modifier la liste"),
        button("reasons-reset", "Réinitialiser"),
        backButton(),
      ),
    );

  return panel(container);
}

function renderLadderView({ ladder }) {
  const container = section(
    "Paliers",
    `La sanction dépend du nombre d'avertissements actifs du membre.\n${describeLadder(ladder)}`,
  )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      buttons(
        button("ladder-edit", "Modifier"),
        button("ladder-reset", "Réinitialiser"),
        backButton(),
      ),
    );

  return panel(container);
}

function renderValidityView({ settings }) {
  const container = section(
    "Durée",
    `${describeValidity(settings)}.\nUn avertissement expiré ne compte plus pour les paliers, mais reste visible dans \`/warnlist\`.`,
  )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      buttons(button("validity", "Modifier"), backButton()),
    );

  return panel(container);
}

function renderContestView({ settings }) {
  const container = section(
    "Contestation",
    `${describeContest(settings)}.\nUn membre bloqué peut contester pendant ce temps ; un avertissement retiré retire aussi sa sanction.`,
  )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      buttons(button("contest", "Modifier"), backButton()),
    );

  return panel(container);
}

function renderJusticeView({ settings }) {
  const category = new ChannelSelectMenuBuilder()
    .setCustomId(id("justice-category"))
    .setPlaceholder("Catégorie Justice")
    .setChannelTypes(ChannelType.GuildCategory);
  const clear = button("justice-clear", "Retirer la catégorie").setDisabled(
    settings.justiceCategory === null,
  );

  const container = section(
    "Justice",
    `${settings.justiceCategory ? `<#${settings.justiceCategory}>` : "Aucune catégorie"}\nChaque contestation ouvre un salon privé dans cette catégorie : le membre et les modérateurs y discutent, puis le salon est supprimé.`,
  )
    .addActionRowComponents((row) => row.addComponents(category))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      setting(
        "Conserver la discussion",
        settings.keepTranscript
          ? "Activé : un fichier de la conversation est envoyé aux logs avant la suppression du salon."
          : "Désactivé : la conversation disparaît avec le salon.",
        toggle("transcript-toggle", settings.keepTranscript),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(buttons(clear, backButton()));

  return panel(container);
}

function renderObservationView({ settings }) {
  const container = section(
    "Mode observation",
    `${settings.observation ? "Activé" : "Désactivé"}.\nEn observation, rien n'est bloqué ni sanctionné : les messages sont seulement signalés dans les logs.`,
  )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      buttons(toggle("observation-toggle", settings.observation), backButton()),
    );

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
    .addActionRowComponents((row) => row.addComponents(backButton()));

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
    .addActionRowComponents((row) => row.addComponents(clear, backButton()));

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

function renderReasonsModal({ reasons }) {
  return new ModalBuilder()
    .setCustomId(id("save-reasons"))
    .setTitle("Raisons")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Raisons")
        .setDescription("Une raison par ligne, 24 au maximum.")
        .setTextInputComponent(
          field("reasons", reasons.join("\n"), TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1300),
        ),
    );
}

function renderLadderModal({ lines }) {
  return new ModalBuilder()
    .setCustomId(id("save-ladder"))
    .setTitle("Paliers")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Une ligne par avertissement")
        .setDescription(
          "aucune, sourdine 10 min, 1 h, 2 j, expulsion, bannissement. La dernière ligne vaut aussi au-delà.",
        )
        .setTextInputComponent(
          field("ladder", lines, TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
    );
}

function renderValidityModal({ settings }) {
  return new ModalBuilder()
    .setCustomId(id("save-validity"))
    .setTitle("Durée")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Durée d'un avertissement (jours)")
        .setDescription("0 : un avertissement n'expire jamais. Jusqu'à 365.")
        .setTextInputComponent(
          field("days", settings.warnValidDays)
            .setRequired(true)
            .setMaxLength(3),
        ),
    );
}

module.exports = {
  HOME_SECTIONS,
  describeLadder,
  renderMainView,
  renderRulesView,
  renderReasonsView,
  renderLadderView,
  renderValidityView,
  renderContestView,
  renderJusticeView,
  renderObservationView,
  renderExemptionsView,
  renderLogsView,
  renderWordsModal,
  renderMentionLimitModal,
  renderContestModal,
  renderReasonsModal,
  renderLadderModal,
  renderValidityModal,
};
