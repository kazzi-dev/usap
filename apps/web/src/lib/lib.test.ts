import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatDuration, formatOffset } from "./format";
import { createRoomId, parseRoomInput, randomId } from "./ids";

describe("room ids", () => {
  test("room codes look like kfp-wqzt-mbd and never contain l", () => {
    for (let i = 0; i < 200; i++) assert.match(createRoomId(), /^[a-km-z]{3}-[a-km-z]{4}-[a-km-z]{3}$/);
  });

  test("random ids are 32 hex characters and unique", () => {
    assert.match(randomId(), /^[0-9a-f]{32}$/);
    assert.notEqual(randomId(), randomId());
  });

  test("an invite link or a bare code both give the room code", () => {
    assert.equal(parseRoomInput("https://x.trycloudflare.com/room/KFP-wqzt-mbd"), "kfp-wqzt-mbd");
    assert.equal(parseRoomInput("  kfp-wqzt-mbd "), "kfp-wqzt-mbd");
    assert.equal(parseRoomInput(""), null);
    assert.equal(parseRoomInput("not a code!"), null);
  });
});

describe("formatting", () => {
  test("call durations", () => {
    assert.equal(formatDuration("2026-01-01T00:00:00Z", null), "ongoing");
    assert.equal(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:00:45Z"), "45 s");
    assert.equal(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T00:12:00Z"), "12 min");
    assert.equal(formatDuration("2026-01-01T00:00:00Z", "2026-01-01T01:05:00Z"), "1 h 5 min");
  });

  test("timestamps inside a call", () => {
    assert.equal(formatOffset(207_000), "03:27");
    assert.equal(formatOffset(-5), "00:00");
  });
});
