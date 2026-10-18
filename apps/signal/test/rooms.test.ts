import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PeerInfo } from "@usap/shared";
import { RoomManager } from "../src/rooms.js";

const peer = (clientId: string): PeerInfo =>
  ({ clientId, name: clientId, media: { audio: true, video: true }, lang: "en" }) as PeerInfo;

describe("RoomManager", () => {
  test("two people can join, a third is turned away", () => {
    const rooms = new RoomManager({ capacity: 2, graceMs: 1000 });
    assert.equal(rooms.join("r", peer("a"), "s1").ok, true);
    const second = rooms.join("r", peer("b"), "s2");
    assert.ok(second.ok);
    assert.deepEqual(second.peers.map((p) => p.clientId), ["a"]);
    assert.deepEqual(rooms.join("r", peer("c"), "s3"), { ok: false, error: "room-full" });
  });

  test("the same clientId on a new socket resumes its slot", () => {
    const rooms = new RoomManager({ capacity: 2, graceMs: 1000 });
    rooms.join("r", peer("a"), "s1");
    const again = rooms.join("r", peer("a"), "s2");
    assert.ok(again.ok);
    assert.equal(again.resumed, true);
    assert.equal(again.previousSocketId, "s1");
  });

  test("a disconnected ghost is evicted to make room after a page reload", () => {
    const rooms = new RoomManager({ capacity: 2, graceMs: 60_000 });
    rooms.join("r", peer("a"), "s1");
    rooms.join("r", peer("b"), "s2");
    assert.equal(rooms.disconnect("r", "b", "s2", () => {}), true);
    const reload = rooms.join("r", peer("b2"), "s3");
    assert.ok(reload.ok);
    assert.deepEqual(reload.evicted.map((p) => p.clientId), ["b"]);
  });

  test("a stale socket's disconnect is ignored after a resume", () => {
    const rooms = new RoomManager({ capacity: 2, graceMs: 1000 });
    rooms.join("r", peer("a"), "s1");
    rooms.join("r", peer("a"), "s2");
    assert.equal(rooms.disconnect("r", "a", "s1", () => {}), false);
  });

  test("the slot is released when the grace period runs out", async () => {
    const rooms = new RoomManager({ capacity: 1, graceMs: 10 });
    rooms.join("r", peer("a"), "s1");
    await new Promise<void>((resolve) => rooms.disconnect("r", "a", "s1", resolve));
    assert.equal(rooms.join("r", peer("b"), "s2").ok, true);
  });
});
