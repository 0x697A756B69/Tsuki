const SEPARATOR = ":";
const MAX_LENGTH = 100;

function buildCustomId(id, ...params) {
  const parts = [id, ...params].map(String);
  if (parts.some((part) => part.includes(SEPARATOR)))
    throw new TypeError(`Custom ID parts cannot contain "${SEPARATOR}"`);

  const customId = parts.join(SEPARATOR);
  if (customId.length > MAX_LENGTH)
    throw new RangeError(`Custom ID is longer than ${MAX_LENGTH} characters`);
  return customId;
}

function parseCustomId(customId) {
  const [id, ...params] = customId.split(SEPARATOR);
  return { id, params };
}

module.exports = { buildCustomId, parseCustomId };
