import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const subject = await import("../scripts/lib/theme-store.mjs").catch(() => ({}));

test("saved custom theme can be reused locally by its full ID", (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-themes-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const backgroundBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const id = "theme_01jz1234567890abcdefghijk";
  const store = subject.createThemeStore({ homeDir });

  store.save({
    id,
    name: "Northern Lights",
    colors: ["#12ff88", "#6155ff", "#07111f"],
    css: ":root{--accent:#12ff88}",
    backgroundBytes,
    backgroundMime: "image/png",
  });

  const reloaded = subject.createThemeStore({ homeDir }).findById(id);
  assert.equal(reloaded.id, id);
  assert.equal(reloaded.name, "Northern Lights");
  assert.equal(reloaded.backgroundMime, "image/png");
  assert.deepEqual(readFileSync(reloaded.backgroundPath), backgroundBytes);
});

test("theme list prints full IDs that can be passed directly to --apply", (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-themes-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const store = subject.createThemeStore({ homeDir });
  const id = "theme_01jz1234567890abcdefghijk";
  store.save({ id, name: "Aurora", colors: ["#111111", "#222222", "#333333"], css: "body{}" });

  const output = subject.formatThemeList(store.list());

  assert.match(output, new RegExp(id));
  assert.doesNotMatch(output, /\[theme_01\]/);
  assert.equal(store.findById(id).id, id);
});

test("pending paid operation persists uploadKey and stable idempotency key", (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-operations-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const store = subject.createThemeStore({ homeDir });
  const requestId = "request_abcdef";
  const operation = {
    requestId,
    uploadKey: "uploads/user/source.png",
    idempotencyKey: "gptskin-abcdef",
    status: "pending",
  };

  store.saveOperation(operation);

  assert.deepEqual(subject.createThemeStore({ homeDir }).findOperation(requestId), operation);
});
