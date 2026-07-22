import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const subject = await import("../scripts/lib/config-store.mjs").catch(() => ({}));

test("new config uses gptskin.best without creating a file", (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-config-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const store = subject.createConfigStore({ homeDir });

  assert.deepEqual(store.load(), {
    serverUrl: "https://gptskin.best",
    apiKey: "",
  });
  assert.equal(existsSync(store.configPath), false);
});

test("invalid API key is never persisted", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-config-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const store = subject.createConfigStore({ homeDir });

  const saved = await store.saveApiKeyIfValid("sk-invalid", async () => false);

  assert.equal(saved, false);
  assert.equal(existsSync(store.configPath), false);
});

test("validated API key is written with owner-only permissions", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-config-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const store = subject.createConfigStore({ homeDir });

  const saved = await store.saveApiKeyIfValid("sk-valid", async (candidate) => candidate === "sk-valid");

  assert.equal(saved, true);
  assert.equal(store.load().apiKey, "sk-valid");
  assert.equal(statSync(store.configPath).mode & 0o777, 0o600);
});

test("an invalid replacement keeps the existing valid key", async (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-config-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const store = subject.createConfigStore({ homeDir });
  await store.saveApiKeyIfValid("sk-valid", async () => true);

  const saved = await store.saveApiKeyIfValid("sk-invalid", async () => false);

  assert.equal(saved, false);
  assert.equal(store.load().apiKey, "sk-valid");
});
