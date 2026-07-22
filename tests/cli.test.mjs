import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createThemeStore } from "../scripts/lib/theme-store.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = join(repoRoot, "scripts", "apply-theme.mjs");

test("--list shows locally saved themes with full reusable IDs without requiring an API key", (t) => {
  const homeDir = mkdtempSync(join(tmpdir(), "gptskin-cli-"));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const id = "theme_01jz1234567890abcdefghijk";
  createThemeStore({ homeDir }).save({
    id,
    name: "Saved Aurora",
    colors: ["#111111", "#222222", "#333333"],
    css: "body{}",
  });

  const result = spawnSync(process.execPath, [cliPath, "--list"], {
    cwd: repoRoot,
    env: { ...process.env, GPTSKIN_HOME: homeDir },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(id));
  assert.match(result.stdout, new RegExp(`--apply ${id}`));
});
