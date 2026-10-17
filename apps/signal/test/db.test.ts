import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { AuthError, AuthService } from "../src/auth/auth-service.js";
import { hashPassword, verifyPassword } from "../src/auth/passwords.js";
import { CallRecorder, type RecordingState } from "../src/calls/call-recorder.js";
import { CallStore } from "../src/calls/call-store.js";
import { openDatabase, type Database } from "../src/db/client.js";

// Real Postgres (PGlite, in memory), real migrations: no mocks.
let database: Database;
let auth: AuthService;
let store: CallStore;

before(async () => {
  database = await openDatabase("pglite:memory");
  auth = new AuthService(database.db);
  store = new CallStore(database.db);
});
after(() => database.close());

describe("passwords", () => {
  test("hash verifies the right password only", async () => {
    const hash = await hashPassword("correct horse");
    assert.match(hash, /^scrypt\$/);
    assert.equal(await verifyPassword("correct horse", hash), true);
    assert.equal(await verifyPassword("wrong horse", hash), false);
  });

  test("same password, different salt, different hash", async () => {
    assert.notEqual(await hashPassword("same"), await hashPassword("same"));
  });
});

describe("auth", () => {
  test("sign up, log in, token lookup, log out", async () => {
    const { user, token } = await auth.signUp("Ana@Example.com", "hunter22", "Ana");
    assert.equal((await auth.userForToken(token))?.id, user.id);

    // Email is case-insensitive.
    const login = await auth.logIn("ana@example.com", "hunter22");
    assert.equal(login.user.id, user.id);

    await auth.logOut(login.token);
    assert.equal(await auth.userForToken(login.token), null);
    assert.equal((await auth.userForToken(token))?.id, user.id, "other sessions stay logged in");
  });

  test("duplicate email and wrong password are rejected", async () => {
    await auth.signUp("ben@example.com", "password1", "Ben");
    await assert.rejects(auth.signUp("BEN@example.com", "password2", "Ben 2"), (e) => e instanceof AuthError && e.code === "email-taken");
    await assert.rejects(auth.logIn("ben@example.com", "nope"), (e) => e instanceof AuthError && e.code === "invalid-credentials");
    await assert.rejects(auth.logIn("nobody@example.com", "nope"), (e) => e instanceof AuthError && e.code === "invalid-credentials");
  });

  test("unknown or missing tokens are guests", async () => {
    assert.equal(await auth.userForToken("made-up"), null);
    assert.equal(await auth.userForToken(undefined), null);
  });
});

describe("call recorder", () => {
  test("records only with 2 people incl. a logged-in user, then summarizes on end", async () => {
    const { user } = await auth.signUp("cara@example.com", "password1", "Cara");
    const changes: RecordingState[] = [];
    const ended: string[] = [];
    const recorder = new CallRecorder(
      store,
      { onRecordingChange: (_room, s) => changes.push(s), onCallEnded: (id) => ended.push(id) },
      () => {},
    );

    await recorder.join("room-1", { clientId: "guest", name: "Dan", lang: "en", userId: null });
    assert.equal(recorder.state("room-1").recording, false, "one guest alone: not recorded");

    await recorder.join("room-1", { clientId: "cara", name: "Cara", lang: "tl", userId: user.id });
    const { recording, callId } = recorder.state("room-1");
    assert.equal(recording, true);
    assert.equal(changes.length, 1);

    await recorder.addLine("room-1", {
      speakerClientId: "guest",
      speakerName: "Dan",
      originalText: "Hello!",
      lang: "en",
      translatedText: "Kumusta!",
      targetLang: "tl",
      spokenAt: Date.now(),
      engine: "groq",
    });
    await recorder.leave("room-1", "guest");
    assert.deepEqual(ended, [], "still one person in the room");
    await recorder.leave("room-1", "cara");
    assert.deepEqual(ended, [callId]);

    const history = await store.listForUser(user.id);
    assert.equal(history[0]?.id, callId);
    assert.equal(history[0]?.lineCount, 1);
    assert.deepEqual(history[0]?.participants.map((p) => p.name).sort(), ["Cara", "Dan"]);

    const detail = await store.getForUser(callId!, user.id);
    assert.equal(detail?.lines[0]?.translatedText, "Kumusta!");
    assert.ok(detail?.call.endedAt);
  });

  test("two guests are never recorded", async () => {
    const recorder = new CallRecorder(store, { onRecordingChange: () => {}, onCallEnded: () => {} }, () => {});
    await recorder.join("room-2", { clientId: "a", name: "A", lang: "en", userId: null });
    await recorder.join("room-2", { clientId: "b", name: "B", lang: "ja", userId: null });
    assert.equal(recorder.state("room-2").recording, false);
  });

  test("a call is private to its participants", async () => {
    const owner = await auth.signUp("eve@example.com", "password1", "Eve");
    const stranger = await auth.signUp("mallory@example.com", "password1", "Mallory");
    const recorder = new CallRecorder(store, { onRecordingChange: () => {}, onCallEnded: () => {} }, () => {});
    await recorder.join("room-3", { clientId: "e", name: "Eve", lang: "en", userId: owner.user.id });
    await recorder.join("room-3", { clientId: "g", name: "Guest", lang: "en", userId: null });
    const { callId } = recorder.state("room-3");
    assert.ok(await store.getForUser(callId!, owner.user.id));
    assert.equal(await store.getForUser(callId!, stranger.user.id), null);
  });
});
