const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ACTION_SETTINGS,
  SIGNAL_SETTINGS,
  enabledSignals,
  parseAccountDays,
  parseRaidCalm,
  parseRaidModal,
  parseRaidThresholds,
  parseRaidWindow,
  parseTimeoutMinutes,
  signalChanges,
  toggleRaid,
} = require("../utils/raidConfig");

test("parseRaidWindow accepts 1 to 60 minutes", () => {
  assert.deepEqual(parseRaidWindow("10"), { windowMinutes: 10 });
  assert.deepEqual(parseRaidWindow(" 60 "), { windowMinutes: 60 });
  for (const value of ["0", "61", "abc", "", "1.5", "-3"])
    assert.match(parseRaidWindow(value).error, /entre 1 et 60/);
});

test("parseRaidCalm accepts 1 to 1440 minutes", () => {
  assert.deepEqual(parseRaidCalm("1440"), { calmMinutes: 1440 });
  assert.match(parseRaidCalm("1441").error, /entre 1 et 1440/);
  assert.match(parseRaidCalm("0").error, /entre 1 et 1440/);
});

test("parseAccountDays accepts 1 to 365 days", () => {
  assert.deepEqual(parseAccountDays("7"), { accountDays: 7 });
  assert.match(parseAccountDays("366").error, /entre 1 et 365/);
  assert.match(parseAccountDays("x").error, /entre 1 et 365/);
});

test("parseTimeoutMinutes accepts 1 to 40320 minutes", () => {
  assert.deepEqual(parseTimeoutMinutes("40320"), { timeoutMinutes: 40320 });
  assert.match(parseTimeoutMinutes("40321").error, /entre 1 et 40320/);
  assert.match(parseTimeoutMinutes("0").error, /entre 1 et 40320/);
});

test("parseRaidThresholds reads three increasing numbers with any separator", () => {
  const expected = { watchJoins: 5, alertJoins: 8, raidJoins: 10 };
  assert.deepEqual(parseRaidThresholds("5 / 8 / 10"), expected);
  assert.deepEqual(parseRaidThresholds("5,8,10"), expected);
  assert.deepEqual(parseRaidThresholds("5 8 10"), expected);
});

test("parseRaidThresholds accepts equal thresholds", () => {
  assert.deepEqual(parseRaidThresholds("4/4/4"), {
    watchJoins: 4,
    alertJoins: 4,
    raidJoins: 4,
  });
});

test("parseRaidThresholds rejects anything else", () => {
  for (const value of [
    "",
    "5 / 8",
    "5 / 8 / 10 / 12",
    "10 / 8 / 5",
    "5 / 12 / 10",
    "1 / 8 / 10",
    "5 / 8 / 201",
    "a / b / c",
    "5 / 8 / 1.5",
  ])
    assert.match(parseRaidThresholds(value).error, /trois entiers croissants/);
});

test("parseRaidModal merges every field", () => {
  assert.deepEqual(
    parseRaidModal({
      window: "15",
      calm: "20",
      thresholds: "6 / 9 / 12",
      accountDays: "3",
    }),
    {
      windowMinutes: 15,
      calmMinutes: 20,
      watchJoins: 6,
      alertJoins: 9,
      raidJoins: 12,
      accountDays: 3,
    },
  );
});

test("parseRaidModal reports the first invalid field", () => {
  const valid = {
    window: "15",
    calm: "20",
    thresholds: "6 / 9 / 12",
    accountDays: "3",
  };
  assert.match(parseRaidModal({ ...valid, window: "0" }).error, /fenêtre/);
  assert.match(parseRaidModal({ ...valid, calm: "x" }).error, /calme/);
  assert.match(parseRaidModal({ ...valid, thresholds: "3" }).error, /seuils/);
  assert.match(
    parseRaidModal({ ...valid, accountDays: "0" }).error,
    /compte récent/,
  );
});

test("toggleRaid refuses to turn on without a log channel", () => {
  assert.match(toggleRaid({ enabled: false }, null).error, /salon de logs/);
  assert.deepEqual(toggleRaid({ enabled: false }, "log"), { enabled: true });
});

test("toggleRaid always allows turning off", () => {
  assert.deepEqual(toggleRaid({ enabled: true }, null), { enabled: false });
});

test("signalChanges turns the chosen signals on and the others off", () => {
  assert.deepEqual(signalChanges(["age", "invite"]), {
    signalAge: true,
    signalAvatar: false,
    signalNames: false,
    signalBurst: false,
    signalInvite: true,
  });
  assert.deepEqual(
    Object.keys(signalChanges([])),
    Object.values(SIGNAL_SETTINGS),
  );
});

test("enabledSignals lists the signals that are on", () => {
  assert.deepEqual(
    enabledSignals({
      signalAge: true,
      signalAvatar: false,
      signalNames: true,
      signalBurst: false,
      signalInvite: false,
    }),
    ["age", "names"],
  );
});

test("ACTION_SETTINGS maps each tier to its setting", () => {
  assert.deepEqual(ACTION_SETTINGS, {
    watch: "watchAction",
    alert: "alertAction",
    raid: "raidAction",
  });
});
