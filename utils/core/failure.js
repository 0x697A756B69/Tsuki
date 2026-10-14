const KINDS = {
  permissions: "permissions ou hiérarchie",
  missing: "membre introuvable",
  rateLimit: "limite de débit atteinte",
  unknown: "erreur inconnue",
};

const PERMISSION_CODES = [50001, 50013];
const MISSING_CODES = [10007, 10013];

function describeFailure(err) {
  const code = Number(err?.code);
  const status = Number(err?.status);
  const message = String(err?.message ?? "");
  if (status === 429 || /rate ?limit/i.test(message)) return KINDS.rateLimit;
  if (
    PERMISSION_CODES.includes(code) ||
    /missing (permissions|access)/i.test(message)
  )
    return KINDS.permissions;
  if (
    MISSING_CODES.includes(code) ||
    /unknown (member|user)|not found/i.test(message)
  )
    return KINDS.missing;
  return KINDS.unknown;
}

function summarizeCauses(causes) {
  return [...new Set(causes)].join(", ");
}

module.exports = { KINDS, describeFailure, summarizeCauses };
