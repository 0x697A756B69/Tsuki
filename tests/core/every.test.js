const test = require("node:test");
const assert = require("node:assert/strict");
const { every } = require("../../utils/core/every");

function silence(t) {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  return logs;
}

test("every runs the task on each interval", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let runs = 0;
  const { timer } = every("job", 1000, async () => {
    runs += 1;
  });

  t.after(() => clearInterval(timer));

  for (let tick = 0; tick < 3; tick += 1) {
    t.mock.timers.tick(1000);
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(runs, 3);
});

test("every skips a tick while the previous run is not over", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let runs = 0;
  /** @type {(value?: unknown) => void} */
  let release = () => {};
  const { timer, run } = every("job", 1000, () => {
    runs += 1;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  t.after(() => clearInterval(timer));

  const first = run();
  await run();
  assert.equal(runs, 1);
  release();
  await first;
  const second = run();
  release();
  await second;

  assert.equal(runs, 2);
});

test("every logs a failure with the job name and keeps running", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const logs = silence(t);
  let runs = 0;
  const { timer, run } = every("mute sweep", 1000, async () => {
    runs += 1;
    throw new Error("boom");
  });
  t.after(() => clearInterval(timer));

  await run();
  await run();

  assert.equal(runs, 2);
  assert.equal(logs.length, 2);
  assert.equal(logs[0][0], "[mute sweep]");
});

test("every also catches a task that throws before returning a promise", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const logs = silence(t);
  const { timer, run } = every("job", 1000, () => {
    throw new Error("sync");
  });
  t.after(() => clearInterval(timer));

  await run();

  assert.equal(logs.length, 1);
});
