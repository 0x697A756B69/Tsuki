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
  getActivityLabel,
  getActivityTitle,
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

test("getActivityLabel adapts to the period", () => {
  assert.equal(getActivityLabel("week", "2026-10-05"), "L");
  assert.equal(getActivityLabel("month", "2026-09-28"), "28/9");
  assert.equal(getActivityLabel("month", "2026-10-05"), "5/10");
  assert.equal(getActivityLabel("global", "2026-10-01"), "O");
  assert.equal(getActivityLabel("global", "2026-01-01"), "J");
});

test("getActivityTitle names the covered span", () => {
  assert.equal(getActivityTitle("week"), "Activité · 7 jours");
  assert.equal(getActivityTitle("month"), "Activité · 4 semaines");
  assert.equal(getActivityTitle("global"), "Activité · 6 mois");
  assert.equal(getActivityTitle("year"), "Activité · 7 jours");
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

async function readPixels(png) {
  const { loadImage, createCanvas } = require("@napi-rs/canvas");
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return (x, y, width = 1, height = 1) =>
    ctx.getImageData(x, y, width, height).data;
}

function middleOf(data, width, height, isInk) {
  const rows = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (isInk(data.slice((y * width + x) * 4, (y * width + x) * 4 + 3))) {
        rows.push(y);
        break;
      }
  return (Math.min(...rows) + Math.max(...rows)) / 2;
}

function redAvatar() {
  const { createCanvas } = require("@napi-rs/canvas");
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 64, 64);
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

const ROW_CENTER = 213;

test("renderLeaderboard draws each avatar as a round image before the name", async () => {
  const png = await renderLeaderboard({
    type: "messages",
    period: "week",
    members: [{ name: "izuki", value: 10, avatar: redAvatar() }],
    activity,
    channels: [],
  });
  const read = await readPixels(png);
  const [r, g, b] = read(225, ROW_CENTER);
  assert.ok(r > 200 && g < 60 && b < 60, `center is ${r},${g},${b}`);
  const [cr, cg, cb] = read(203, 191);
  assert.ok(!(cr > 200 && cg < 60 && cb < 60), "corner is not clipped");
});

test("renderLeaderboard draws a grey disc when the avatar is missing", async () => {
  const png = await renderLeaderboard({
    type: "messages",
    period: "week",
    members: [
      { name: "gone", value: 10, avatar: null },
      { name: "broken", value: 5, avatar: "https://invalid.invalid/a.png" },
    ],
    activity,
    channels: [],
  });
  const read = await readPixels(png);
  for (const y of [ROW_CENTER, ROW_CENTER + 76]) {
    const [r, g, b] = read(225, y);
    assert.ok(Math.abs(r - g) < 8 && Math.abs(g - b) < 8, `row at ${y}`);
    assert.ok(r > 60 && r < 140, `grey is ${r}`);
  }
});

test("renderLeaderboard keeps an even gap on both sides of the avatar", async () => {
  const png = await renderLeaderboard({
    type: "messages",
    period: "week",
    members: [{ name: "WWWWWWWW", value: 10, avatar: redAvatar() }],
    activity,
    channels: [],
  });
  const read = await readPixels(png);
  const data = read(150, 190, 200, 46);
  const columns = [];
  for (let x = 0; x < 200; x++)
    for (let y = 0; y < 46; y++)
      if (data[(y * 200 + x) * 4] > 100) {
        columns.push(x + 150);
        break;
      }
  const moonEnd = Math.max(...columns.filter((x) => x < 195));
  const avatarStart = Math.min(...columns.filter((x) => x >= 195));
  const avatarEnd = Math.max(...columns.filter((x) => x < 258));
  const nameStart = Math.min(...columns.filter((x) => x >= 258));
  assert.ok(
    Math.abs(avatarStart - moonEnd - (nameStart - avatarEnd)) <= 4,
    `gaps ${avatarStart - moonEnd} and ${nameStart - avatarEnd}`,
  );
});

test("renderLeaderboard centers rank, moon, avatar and name on the same line", async () => {
  const png = await renderLeaderboard({
    type: "messages",
    period: "week",
    members: [{ name: "izuki", value: 10, avatar: null }],
    activity,
    channels: [],
  });
  const read = await readPixels(png);
  const bright = ([r]) => r > 60;
  const parts = {
    rank: [72, 36],
    moon: [150, 33],
    avatar: [201, 48],
    name: [267, 160],
  };
  for (const [part, [x, width]] of Object.entries(parts)) {
    const middle = middleOf(read(x, 175, width, 76), width, 76, bright);
    assert.ok(
      Math.abs(middle + 175 - ROW_CENTER) <= 3,
      `${part} middle at ${middle + 175}`,
    );
  }
});
