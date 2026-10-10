const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ChannelType,
  ComponentType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require("discord.js");
const { RULE_NAMES } = require("../utils/automodRules");
const { buildLogMessage } = require("../utils/automodLogs");
const { CONTEST_COLOR, contestedPayload } = require("../utils/automodContest");
const {
  contestChannelName,
  moderatorRoleIds,
  contestOverwrites,
  canOpenContestChannel,
  sanctionLabel,
  logSummary,
  buildContestMessage,
} = require("../utils/automodJustice");

const DETAILS = {
  userId: "u",
  rule: "Mot interdit",
  warningId: "WARN-1",
  sanction: "Aucune",
  reason: "faux positif\nmerci",
  blocked: "phrase avec un gros mot",
};

function role(id, ...permissions) {
  return { id, permissions: new PermissionsBitField(permissions) };
}

test("contestChannelName slugs the member name", () => {
  assert.equal(
    contestChannelName("Léa Dupont_42"),
    "contestation-lea-dupont-42",
  );
});

test("contestChannelName falls back when nothing usable is left", () => {
  assert.equal(contestChannelName("日本語"), "contestation-membre");
  assert.equal(contestChannelName(undefined), "contestation-membre");
});

test("contestChannelName cuts long names without a trailing dash", () => {
  const name = contestChannelName(`${"a".repeat(39)} bbb`);
  assert.equal(name, `contestation-${"a".repeat(39)}`);
  assert.ok(name.length <= 100);
});

test("moderatorRoleIds keeps the roles that can manage messages", () => {
  const roles = [
    role("g", PermissionFlagsBits.ManageMessages),
    role("mod", PermissionFlagsBits.ManageMessages),
    role("fan", PermissionFlagsBits.SendMessages),
  ];
  assert.deepEqual(moderatorRoleIds(roles, "g"), ["mod"]);
});

test("contestOverwrites hides the channel from everyone else", () => {
  const overwrites = contestOverwrites({
    guildId: "g",
    memberId: "u",
    botId: "bot",
    moderatorIds: ["mod"],
  });
  const of = (id) => overwrites.find((entry) => entry.id === id);
  assert.deepEqual(of("g").deny, [PermissionFlagsBits.ViewChannel]);
  assert.ok(of("u").allow.includes(PermissionFlagsBits.SendMessages));
  assert.ok(of("mod").allow.includes(PermissionFlagsBits.ManageMessages));
  assert.ok(of("bot").allow.includes(PermissionFlagsBits.ManageChannels));
  assert.equal(overwrites.length, 4);
});

test("canOpenContestChannel needs a category and Manage Channels", () => {
  const category = { type: ChannelType.GuildCategory };
  const allowed = new PermissionsBitField(PermissionFlagsBits.ManageChannels);
  assert.equal(canOpenContestChannel(category, allowed), true);
  assert.equal(
    canOpenContestChannel(category, new PermissionsBitField()),
    false,
  );
  assert.equal(
    canOpenContestChannel({ type: ChannelType.GuildText }, allowed),
    false,
  );
  assert.equal(canOpenContestChannel(null, allowed), false);
});

test("sanctionLabel names the sanction and the end of a timeout", () => {
  assert.equal(sanctionLabel(null), "Aucune");
  assert.equal(sanctionLabel(undefined), "Aucune");
  assert.equal(sanctionLabel("kick"), "Expulsion");
  assert.equal(sanctionLabel("ban"), "Bannissement");
  assert.equal(sanctionLabel("timeout"), "Mise en sourdine");
  assert.equal(
    sanctionLabel("timeout", 90_000),
    "Mise en sourdine jusqu'au <t:90:f>",
  );
});

function panel() {
  return buildLogMessage({
    ruleKey: "words",
    ruleName: RULE_NAMES.words,
    userId: "u",
    channelId: "c",
    warningTotal: 1,
    warningId: "WARN-1",
    content: "gros mot",
  }).components[0].toJSON();
}

test("logSummary reads the rule and the blocked message of a log", () => {
  assert.deepEqual(logSummary(panel()), {
    rule: "mot interdit",
    blocked: "gros mot",
  });
});

test("logSummary gives null when the log has neither", () => {
  assert.deepEqual(
    logSummary({
      components: [{ type: ComponentType.TextDisplay, content: "autre" }],
    }),
    { rule: null, blocked: null },
  );
});

test("buildContestMessage lays out the case for the member", () => {
  const message = buildContestMessage(DETAILS);
  const container = message.components[0].toJSON();
  const json = JSON.stringify(container);
  assert.equal(container.accent_color, CONTEST_COLOR);
  assert.match(json, /Contestation de <@u>/);
  assert.match(json, /\*\*Raison :\*\* Mot interdit/);
  assert.match(json, /\*\*Avertissement :\*\* WARN-1/);
  assert.match(json, /\*\*Sanction :\*\* Aucune/);
  assert.match(json, /> phrase avec un gros mot/);
  assert.match(json, /> faux positif\\n> merci/);
  assert.deepEqual(message.allowedMentions, { parse: [] });
});

test("buildContestMessage says so when details are missing", () => {
  const json = JSON.stringify(
    buildContestMessage({
      ...DETAILS,
      rule: null,
      warningId: null,
      reason: null,
      blocked: null,
    }).components[0].toJSON(),
  );
  assert.match(json, /Raison :\*\* Inconnue/);
  assert.match(json, /Avertissement :\*\* Aucun/);
  assert.match(json, /Aucun motif donné/);
  assert.match(json, /Message indisponible/);
});

test("contestedPayload links the private channel when there is one", () => {
  const withChannel = JSON.stringify(
    contestedPayload(panel(), { reason: "x", channelId: "room" }),
  );
  assert.match(withChannel, /\*\*Salon :\*\* <#room>/);
  const without = JSON.stringify(contestedPayload(panel(), { reason: "x" }));
  assert.doesNotMatch(without, /Salon :\*\* <#room>/);
});
