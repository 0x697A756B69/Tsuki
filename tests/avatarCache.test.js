const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TTL,
  MAX_ENTRIES,
  loadAvatar,
  clearAvatars,
} = require("../utils/avatarCache");

function createLoader() {
  const calls = [];
  return {
    calls,
    load: async (url) => {
      calls.push(url);
      return { url };
    },
  };
}

test("loadAvatar gives no image without a URL", async () => {
  clearAvatars();
  const { load, calls } = createLoader();

  assert.equal(await loadAvatar(null, { load }), null);
  assert.equal(await loadAvatar("", { load }), null);
  assert.equal(calls.length, 0);
});

test("loadAvatar reuses the cached image until it expires", async () => {
  clearAvatars();
  const { load, calls } = createLoader();

  const first = await loadAvatar("https://cdn/a.png", { now: 1000, load });
  const again = await loadAvatar("https://cdn/a.png", {
    now: 1000 + TTL - 1,
    load,
  });
  assert.equal(again, first);
  assert.equal(calls.length, 1);

  await loadAvatar("https://cdn/a.png", { now: 1000 + TTL, load });
  assert.equal(calls.length, 2);
});

test("loadAvatar gives no image when loading fails, and retries next time", async () => {
  clearAvatars();
  let attempts = 0;
  const load = async () => {
    attempts++;
    if (attempts === 1) throw new Error("404");
    return { ok: true };
  };

  assert.equal(await loadAvatar("https://cdn/b.png", { load }), null);
  assert.deepEqual(await loadAvatar("https://cdn/b.png", { load }), {
    ok: true,
  });
  assert.equal(attempts, 2);
});

test("loadAvatar gives up on a slow download", async () => {
  clearAvatars();
  const load = () => new Promise(() => {});

  assert.equal(
    await loadAvatar("https://cdn/c.png", { load, timeout: 20 }),
    null,
  );
});

test("loadAvatar forgets the oldest images beyond the limit", async () => {
  clearAvatars();
  const { load, calls } = createLoader();

  for (let index = 0; index <= MAX_ENTRIES; index++)
    await loadAvatar(`https://cdn/${index}.png`, { now: 1000, load });
  assert.equal(calls.length, MAX_ENTRIES + 1);

  await loadAvatar("https://cdn/1.png", { now: 1000, load });
  assert.equal(calls.length, MAX_ENTRIES + 1);

  await loadAvatar("https://cdn/0.png", { now: 1000, load });
  assert.equal(calls.length, MAX_ENTRIES + 2);
});
