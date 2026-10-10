const test = require("node:test");
const assert = require("node:assert/strict");
const { OverwriteType } = require("discord.js");
const {
  MAX_WITNESSES,
  NOT_A_ROOM,
  WITNESS_PERMISSIONS,
  witnessIds,
  witnessCheck,
  witnessNotice,
} = require("../utils/automodWitness");

const ROOM = { userId: "u" };
const member = (id) => ({ id, type: OverwriteType.Member });
const roleEntry = (id) => ({ id, type: OverwriteType.Role });

test("witnessIds keeps only extra members of the room", () => {
  const overwrites = [
    roleEntry("g"),
    roleEntry("mod"),
    member("u"),
    member("bot"),
    member("w1"),
    member("w2"),
  ];
  assert.deepEqual(witnessIds(overwrites, { memberId: "u", botId: "bot" }), [
    "w1",
    "w2",
  ]);
});

test("witnessIds is empty when nobody was added", () => {
  const overwrites = [roleEntry("g"), member("u"), member("bot")];
  assert.deepEqual(witnessIds(overwrites, { memberId: "u", botId: "bot" }), []);
});

test("witnessCheck refuses outside a contest room", () => {
  const error = witnessCheck({
    action: "add",
    room: null,
    target: { id: "w", bot: false },
    witnesses: [],
  });
  assert.equal(error, NOT_A_ROOM);
});

test("witnessCheck refuses bots and the contesting member", () => {
  const base = { action: "add", room: ROOM, witnesses: [] };
  assert.match(
    witnessCheck({ ...base, target: { id: "b", bot: true } }),
    /bot/,
  );
  assert.match(
    witnessCheck({ ...base, target: { id: "u", bot: false } }),
    /contesté/,
  );
});

test("witnessCheck accepts a new witness under the limit", () => {
  const error = witnessCheck({
    action: "add",
    room: ROOM,
    target: { id: "w3", bot: false },
    witnesses: ["w1", "w2"],
  });
  assert.equal(error, null);
});

test("witnessCheck refuses a witness already there", () => {
  const error = witnessCheck({
    action: "add",
    room: ROOM,
    target: { id: "w1", bot: false },
    witnesses: ["w1"],
  });
  assert.equal(error, "<@w1> est déjà témoin.");
});

test("witnessCheck refuses a fourth witness", () => {
  const error = witnessCheck({
    action: "add",
    room: ROOM,
    target: { id: "w4", bot: false },
    witnesses: ["w1", "w2", "w3"],
  });
  assert.equal(MAX_WITNESSES, 3);
  assert.match(error, /3 témoins/);
});

test("witnessCheck lets a full room remove a witness", () => {
  const error = witnessCheck({
    action: "remove",
    room: ROOM,
    target: { id: "w2", bot: false },
    witnesses: ["w1", "w2", "w3"],
  });
  assert.equal(error, null);
});

test("witnessCheck refuses to remove someone who is not a witness", () => {
  const error = witnessCheck({
    action: "remove",
    room: ROOM,
    target: { id: "x", bot: false },
    witnesses: ["w1"],
  });
  assert.equal(error, "<@x> n'est pas témoin.");
});

test("witnessNotice announces the change", () => {
  assert.match(witnessNotice("add", "w"), /<@w> est ajouté\(e\)/);
  assert.match(witnessNotice("remove", "w"), /<@w> n'est plus témoin/);
});

test("WITNESS_PERMISSIONS lets a witness read and write only", () => {
  assert.deepEqual(Object.keys(WITNESS_PERMISSIONS).sort(), [
    "ReadMessageHistory",
    "SendMessages",
    "ViewChannel",
  ]);
});
