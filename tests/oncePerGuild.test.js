const test = require("node:test");
const assert = require("node:assert/strict");
const { oncePerGuild } = require("../utils/oncePerGuild");

test("oncePerGuild shares one running task between callers", async () => {
  let runs = 0;
  const task = async () => {
    runs += 1;
    return runs;
  };
  const [first, second] = await Promise.all([
    oncePerGuild("kind", "g", task),
    oncePerGuild("kind", "g", task),
  ]);
  assert.equal(runs, 1);
  assert.equal(first, second);
});

test("oncePerGuild runs again once the task is over or for another guild", async () => {
  let runs = 0;
  const task = async () => ++runs;
  await oncePerGuild("kind", "g", task);
  await oncePerGuild("kind", "g", task);
  await Promise.all([
    oncePerGuild("kind", "other", task),
    oncePerGuild("else", "g", task),
  ]);
  assert.equal(runs, 4);
});

test("oncePerGuild forgets a task that failed", async () => {
  await assert.rejects(
    oncePerGuild("kind", "g", async () => {
      throw new Error("boom");
    }),
  );
  assert.equal(await oncePerGuild("kind", "g", async () => "ok"), "ok");
});
