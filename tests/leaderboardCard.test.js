const test = require("node:test");
const assert = require("node:assert/strict");
const {
  renderLeaderboard,
  formatDuration,
  getTrailLength,
  getMedalColor,
  getMoonPhase,
  getActivityBlocks,
  getWeekdayLabel,
  getPeriodLabel,
  getTypeLabel,
} = require("../utils/leaderboardCard");

const members = Array.from({ length: 10 }, (_, index) => ({
  name: `member${index + 1}`,
  value: 1000 - index * 90,
}));

const activity = [5, 0, 12, 7, 0, 3, 9].map((value, index) => ({
  day: `2026-10-0${2 + index}`,
  value,
}));

const channels = [
  { name: "#general", value: 500 },
  { name: "#memes", value: 120 },
];

const voice = [{ name: "member1", value: 135 }];

function size(png) {
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

test("formatDuration shows minutes under an hour and hours above", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(60), "1 h");
  assert.equal(formatDuration(65), "1 h 05");
  assert.equal(formatDuration(1450), "24 h 10");
});

test("formatDuration ignores negative and fractional input", () => {
  assert.equal(formatDuration(-5), "0 min");
  assert.equal(formatDuration(59.6), "1 h");
});

test("getTrailLength is the share of the first, at least one square", () => {
  assert.equal(getTrailLength(100, 100), 36);
  assert.equal(getTrailLength(50, 100), 18);
  assert.equal(getTrailLength(1, 1000), 1);
  assert.equal(getTrailLength(100, 100, 10), 10);
});

test("getTrailLength is empty without a value or a maximum", () => {
  assert.equal(getTrailLength(0, 100), 0);
  assert.equal(getTrailLength(-5, 100), 0);
  assert.equal(getTrailLength(10, 0), 0);
  assert.equal(getTrailLength(10, NaN), 0);
});

test("getMedalColor gives gold, silver and bronze to the podium only", () => {
  const podium = [1, 2, 3].map(getMedalColor);
  assert.equal(new Set(podium).size, 3);
  assert.equal(getMedalColor(4), getMedalColor(10));
  assert.ok(!podium.includes(getMedalColor(4)));
});

test("getMoonPhase goes from the full moon to the last crescent", () => {
  assert.equal(getMoonPhase(1), 0);
  assert.equal(getMoonPhase(5), 4);
  assert.equal(getMoonPhase(10), 9);
  assert.equal(getMoonPhase(25), 9);
  assert.equal(getMoonPhase(0), 0);
});

test("getActivityBlocks scales the columns on the peak", () => {
  assert.deepEqual(getActivityBlocks([0, 3, 6, 12], 6), [
    { blocks: 0, peak: false },
    { blocks: 2, peak: false },
    { blocks: 3, peak: false },
    { blocks: 6, peak: true },
  ]);
});

test("getActivityBlocks keeps one block for small values and handles empty weeks", () => {
  assert.deepEqual(getActivityBlocks([1, 1000], 6), [
    { blocks: 1, peak: false },
    { blocks: 6, peak: true },
  ]);
  assert.deepEqual(getActivityBlocks([0, 0, 0], 6), [
    { blocks: 0, peak: false },
    { blocks: 0, peak: false },
    { blocks: 0, peak: false },
  ]);
});

test("getActivityBlocks marks every column that reaches the peak", () => {
  assert.deepEqual(
    getActivityBlocks([4, 4, 2], 6).map((column) => column.peak),
    [true, true, false],
  );
});

test("getWeekdayLabel gives the French initial of the day", () => {
  assert.equal(getWeekdayLabel("2026-10-05"), "L");
  assert.equal(getWeekdayLabel("2026-10-07"), "M");
  assert.equal(getWeekdayLabel("2026-10-08"), "J");
  assert.equal(getWeekdayLabel("2026-10-09"), "V");
  assert.equal(getWeekdayLabel("2026-10-10"), "S");
  assert.equal(getWeekdayLabel("2026-10-11"), "D");
});

test("period and type labels are in French with a safe default", () => {
  assert.equal(getPeriodLabel("global"), "Depuis toujours");
  assert.equal(getPeriodLabel("month"), "Ce mois-ci");
  assert.equal(getPeriodLabel("week"), "Cette semaine");
  assert.equal(getPeriodLabel("year"), getPeriodLabel("global"));
  assert.equal(getTypeLabel("messages"), "Messages");
  assert.equal(getTypeLabel("voice"), "Vocal");
  assert.equal(getTypeLabel("xp"), getTypeLabel("messages"));
});

test("renderLeaderboard returns a 1500x1000 PNG", async () => {
  const png = await renderLeaderboard({
    type: "messages",
    period: "week",
    members,
    activity,
    channels,
    voice,
  });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.deepEqual(size(png), [1500, 1000]);
});

test("renderLeaderboard handles empty data and a missing voice panel", async () => {
  const empty = await renderLeaderboard({
    type: "voice",
    period: "month",
    members: [],
    activity: activity.map((entry) => ({ ...entry, value: 0 })),
    channels: [],
    voice: [],
  });
  assert.deepEqual(size(empty), [1500, 1000]);

  const withoutVoice = await renderLeaderboard({
    type: "messages",
    period: "global",
    members: members.slice(0, 2),
    activity,
    channels,
  });
  assert.deepEqual(size(withoutVoice), [1500, 1000]);
});

test("renderLeaderboard handles extreme values", async () => {
  const png = await renderLeaderboard({
    type: "voice",
    period: "global",
    members: [
      { name: "x".repeat(200), value: 123456789 },
      { name: "short", value: 1 },
    ],
    activity,
    channels: [{ name: `#${"y".repeat(200)}`, value: 99999999 }],
    voice: [{ name: "z".repeat(200), value: 999999 }],
  });
  assert.deepEqual(size(png), [1500, 1000]);
});

test("renderLeaderboard centers the header text in its panel", async () => {
  const { loadImage } = require("@napi-rs/canvas");
  const png = await renderLeaderboard({
    type: "messages",
    period: "month",
    members: [],
    activity,
    channels: [],
  });
  const image = await loadImage(png);
  const { createCanvas } = require("@napi-rs/canvas");
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(72, 30, 880, 100);

  const rows = [];
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 880; x++)
      if (data[(y * 880 + x) * 4] > 235) {
        rows.push(y);
        break;
      }

  const middle = (Math.min(...rows) + Math.max(...rows)) / 2;
  assert.ok(Math.abs(middle - 50) <= 4, `text middle at ${middle}`);
});
