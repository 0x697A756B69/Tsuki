const { loadImage } = require("@napi-rs/canvas");

const TTL = 10 * 60 * 1000;
const MAX_ENTRIES = 100;
const TIMEOUT = 3000;
const cache = new Map();

function withTimeout(promise, timeout) {
  let timer;
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeout);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * @param {string | null | undefined} url
 * @param {{ now?: number, load?: (url: string) => Promise<any>, timeout?: number }} [options]
 */
async function loadAvatar(
  url,
  { now = Date.now(), load = loadImage, timeout = TIMEOUT } = {},
) {
  if (!url) return null;

  const hit = cache.get(url);
  if (hit && now - hit.at < TTL) return hit.image;
  cache.delete(url);

  const image = await withTimeout(
    Promise.resolve(load(url)).catch(() => null),
    timeout,
  );
  if (!image) return null;

  cache.set(url, { image, at: now });
  for (const key of cache.keys()) {
    if (cache.size <= MAX_ENTRIES) break;
    cache.delete(key);
  }
  return image;
}

function clearAvatars() {
  cache.clear();
}

module.exports = { TTL, MAX_ENTRIES, TIMEOUT, loadAvatar, clearAvatars };
