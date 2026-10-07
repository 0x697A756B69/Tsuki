const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanvas } = require("@napi-rs/canvas");
const {
  renderRankCard,
  formatNumber,
  getBarRatio,
  truncateText,
  fitFontSize,
} = require("../utils/rankCard");

function createAvatar() {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#336699";
  ctx.fillRect(0, 0, 64, 64);
  return canvas.toBuffer("image/png");
}

const member = {
  username: "izuki",
  level: 12,
  current: 620,
  required: 1100,
  totalXp: 5420,
  position: 2,
  ranked: 14,
};

test("formatNumber groups thousands with plain spaces", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1100), "1 100");
  assert.equal(formatNumber(1234567), "1 234 567");
  assert.equal(formatNumber(1234567).replace(/ /g, ""), "1234567");
});

test("getBarRatio is the share of the level already earned", () => {
  assert.equal(getBarRatio(0, 100), 0);
  assert.equal(getBarRatio(50, 100), 0.5);
  assert.equal(getBarRatio(100, 100), 1);
});

test("getBarRatio stays between 0 and 1 and ignores bad input", () => {
  assert.equal(getBarRatio(250, 100), 1);
  assert.equal(getBarRatio(-5, 100), 0);
  assert.equal(getBarRatio(10, 0), 0);
  assert.equal(getBarRatio(10, NaN), 0);
});

test("truncateText keeps short text and cuts long text with an ellipsis", () => {
  const measure = (text) => text.length * 10;
  assert.equal(truncateText("izuki", 100, measure), "izuki");
  assert.equal(truncateText("abcdefghij", 100, measure), "abcdefghij");
  assert.equal(truncateText("abcdefghijk", 100, measure), "abcdefghi…");
  assert.ok(measure(truncateText("x".repeat(500), 100, measure)) <= 100);
});

test("truncateText always keeps at least one character", () => {
  assert.equal(
    truncateText("abc", 1, () => 1000),
    "a…",
  );
});

test("fitFontSize keeps the biggest size that fits", () => {
  const measure = (text, size) => text.length * size * 0.5;
  assert.equal(fitFontSize("#2", 190, measure, 84, 32), 84);
  assert.equal(fitFontSize("#1482", 190, measure, 84, 32), 76);
});

test("fitFontSize never goes under the minimum size", () => {
  const measure = (text, size) => text.length * size;
  assert.equal(fitFontSize("#123456789", 10, measure, 84, 32), 32);
});

test("renderRankCard returns a 1500x500 PNG", async () => {
  const png = await renderRankCard({ ...member, avatar: createAvatar() });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1500);
  assert.equal(png.readUInt32BE(20), 500);
});

test("renderRankCard handles extreme values", async () => {
  const cases = [
    { ...member, username: "x".repeat(200) },
    { ...member, position: 123456, ranked: 654321 },
    { ...member, current: 0, totalXp: 0, level: 0, required: 100 },
    { ...member, current: 99999, required: 100 },
  ];
  for (const data of cases) {
    const png = await renderRankCard({ ...data, avatar: createAvatar() });
    assert.equal(png.readUInt32BE(16), 1500);
  }
});
