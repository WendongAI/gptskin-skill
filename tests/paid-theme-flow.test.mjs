import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const subject = await import("../scripts/lib/paid-theme-flow.mjs").catch(() => ({}));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createMemoryStore() {
  const operations = new Map();
  return {
    savedTheme: null,
    findOperation: (id) => operations.get(id) || null,
    saveOperation(operation) {
      operations.set(operation.requestId, operation);
      return operation;
    },
    completeOperation(requestId, themeId) {
      operations.set(requestId, { ...operations.get(requestId), status: "completed", themeId });
    },
    save(theme) {
      this.savedTheme = theme;
      return { ...theme, backgroundPath: "/saved/background.webp" };
    },
    findById: () => null,
  };
}

function createImage(t) {
  const root = mkdtempSync(join(tmpdir(), "gptskin-flow-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const imagePath = join(root, "generated.png");
  writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return imagePath;
}

test("paid image flow compiles by uploadKey then verifies and saves the cloud application artifact", async (t) => {
  const imagePath = createImage(t);
  const backgroundBytes = Buffer.from("compiled-background");
  const calls = [];
  const store = createMemoryStore();
  const client = {
    getCredits: async () => ({ credits: 40 }),
    uploadImage: async (path) => {
      calls.push(["upload", path]);
      return { uploadKey: "uploads/user/source.png", mime: "image/png" };
    },
    compileTheme: async (input) => {
      calls.push(["compile", input]);
      return { status: "completed", theme: { id: "theme_01jz1234567890abcdefghijk" } };
    },
    getThemeApplication: async (id) => ({
      id,
      name: "Aurora Desk",
      colors: ["#11ff99", "#6655ff", "#07111f"],
      css: ":root{--color-token-bg-primary:#07111f}",
      backgroundBase64: backgroundBytes.toString("base64"),
      backgroundMime: "image/webp",
      backgroundSha256: sha256(backgroundBytes),
    }),
  };

  const result = await subject.createPaidTheme({ client, store, imagePath, themeName: "Aurora Desk" });

  assert.equal(calls[0][0], "upload");
  assert.equal(calls[1][0], "compile");
  assert.equal(calls[1][1].uploadKey, "uploads/user/source.png");
  assert.equal(calls[1][1].themeName, "Aurora Desk");
  assert.match(calls[1][1].idempotencyKey, /^gptskin-[a-f0-9]{64}$/);
  assert.deepEqual(store.savedTheme, {
    id: "theme_01jz1234567890abcdefghijk",
    name: "Aurora Desk",
    colors: ["#11ff99", "#6655ff", "#07111f"],
    css: ":root{--color-token-bg-primary:#07111f}",
    backgroundBytes,
    backgroundMime: "image/webp",
    backgroundSha256: sha256(backgroundBytes),
  });
  assert.equal(result.theme.id, store.savedTheme.id);
  assert.equal(result.recovered, false);
});

test("response loss retry reuses persisted uploadKey and Idempotency-Key without a second charge", async (t) => {
  const imagePath = createImage(t);
  const backgroundBytes = Buffer.from("compiled-background");
  const store = createMemoryStore();
  let creditChecks = 0;
  let uploads = 0;
  const compileInputs = [];
  const client = {
    getCredits: async () => {
      creditChecks += 1;
      return { credits: creditChecks === 1 ? 20 : 0 };
    },
    uploadImage: async () => {
      uploads += 1;
      return { uploadKey: "uploads/user/stable.png", mime: "image/png" };
    },
    compileTheme: async (input) => {
      compileInputs.push(input);
      if (compileInputs.length === 1) throw new Error("response lost after server completed charge");
      return { status: "completed", theme: { id: "theme_retry" } };
    },
    getThemeApplication: async (id) => ({
      id,
      name: "Retry Theme",
      colors: ["#111111", "#222222", "#333333"],
      css: ":root{--color-token-bg-primary:#333333}",
      backgroundBase64: backgroundBytes.toString("base64"),
      backgroundMime: "image/webp",
      backgroundSha256: sha256(backgroundBytes),
    }),
  };

  await assert.rejects(
    () => subject.createPaidTheme({ client, store, imagePath, themeName: "Retry Theme" }),
    /response lost/,
  );
  const retried = await subject.createPaidTheme({ client, store, imagePath, themeName: "Retry Theme" });

  assert.equal(retried.theme.id, "theme_retry");
  assert.equal(retried.recovered, true);
  assert.equal(creditChecks, 1);
  assert.equal(uploads, 1);
  assert.equal(compileInputs.length, 2);
  assert.deepEqual(compileInputs[1], compileInputs[0]);
});

test("paid flow rejects a background whose SHA-256 does not match", async (t) => {
  const imagePath = createImage(t);
  const store = createMemoryStore();
  const client = {
    getCredits: async () => ({ credits: 20 }),
    uploadImage: async () => ({ uploadKey: "uploads/user/source.png", mime: "image/png" }),
    compileTheme: async () => ({ status: "completed", theme: { id: "theme_bad_hash" } }),
    getThemeApplication: async () => ({
      name: "Bad Hash",
      colors: ["#111111", "#222222", "#333333"],
      css: ":root{--color-token-bg-primary:#333333}",
      backgroundBase64: Buffer.from("tampered").toString("base64"),
      backgroundMime: "image/webp",
      backgroundSha256: "0".repeat(64),
    }),
  };

  await assert.rejects(
    () => subject.createPaidTheme({ client, store, imagePath, themeName: "Bad Hash" }),
    /background SHA-256 mismatch/i,
  );
  assert.equal(store.savedTheme, null);
});

test("paid flow rejects an application response without full Codex token CSS", async (t) => {
  const imagePath = createImage(t);
  const backgroundBytes = Buffer.from("compiled-background");
  const store = createMemoryStore();
  const client = {
    getCredits: async () => ({ credits: 20 }),
    uploadImage: async () => ({ uploadKey: "uploads/user/source.png", mime: "image/png" }),
    compileTheme: async () => ({ status: "completed", theme: { id: "theme_missing_css" } }),
    getThemeApplication: async () => ({
      name: "Missing CSS",
      colors: ["#111111", "#222222", "#333333"],
      css: "body{}",
      backgroundBase64: backgroundBytes.toString("base64"),
      backgroundMime: "image/webp",
      backgroundSha256: sha256(backgroundBytes),
    }),
  };

  await assert.rejects(
    () => subject.createPaidTheme({ client, store, imagePath, themeName: "Missing CSS" }),
    /full Codex token CSS/i,
  );
  assert.equal(store.savedTheme, null);
});

test("new paid image flow stops before upload when fewer than 20 Credits remain", async (t) => {
  const imagePath = createImage(t);
  let uploaded = false;
  const client = {
    getCredits: async () => ({ credits: 19 }),
    uploadImage: async () => {
      uploaded = true;
    },
  };

  await assert.rejects(
    () => subject.createPaidTheme({ client, store: createMemoryStore(), imagePath }),
    /need 20 Credits/i,
  );
  assert.equal(uploaded, false);
});

test("apply resolution uses a saved theme without calling the website", async () => {
  const localTheme = { id: "theme_local", name: "Local", css: "body{}" };
  let remoteCalled = false;
  const resolved = await subject.resolveThemeForApply({
    id: "theme_local",
    store: { findById: () => localTheme },
    client: { getThemeApplication: async () => { remoteCalled = true; } },
  });

  assert.equal(resolved, localTheme);
  assert.equal(remoteCalled, false);
});

test("cloud reapply verifies CSS and background SHA before returning", async () => {
  const backgroundBytes = Buffer.from("remote-background");
  const client = {
    getThemeApplication: async (id) => ({
      id,
      name: "Remote",
      css: ":root{--color-token-bg-primary:#111111}",
      backgroundBase64: backgroundBytes.toString("base64"),
      backgroundSha256: "0".repeat(64),
    }),
  };

  await assert.rejects(
    () => subject.resolveThemeForApply({
      id: "theme_remote",
      store: { findById: () => null },
      client,
    }),
    /background SHA-256 mismatch/i,
  );
});
