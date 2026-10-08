const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadImage } = require("@napi-rs/canvas");

const directory = path.join(__dirname, "..", "assets", "images", "leaderboard");

test("the leaderboard sky is 1500 by 1000", async () => {
  const sky = await loadImage(path.join(directory, "sky.png"));
  assert.equal(sky.width, 1500);
  assert.equal(sky.height, 1000);
});

test("the ten moon phases are 11 by 11 sprites", async () => {
  for (let phase = 0; phase < 10; phase++) {
    const sprite = await loadImage(path.join(directory, `phase-${phase}.png`));
    assert.equal(sprite.width, 11, `phase-${phase} width`);
    assert.equal(sprite.height, 11, `phase-${phase} height`);
  }
});
