import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("natural language is only an imagegen entry into the single paid image flow", () => {
  const skill = readFileSync(join(root, "SKILL.md"), "utf8");
  assert.match(skill, /natural language only as the interaction trigger/i);
  assert.match(skill, /imagegen[\s\S]+--image/i);
  assert.doesNotMatch(skill, /\/api\/themes\/generate|prompt billing|text[- ]theme/i);
});

test("all shipped CDP scripts avoid the legacy 9223 port", () => {
  for (const file of ["scripts/apply-theme.mjs", "scripts/capture-cdp.mjs", "scripts/launch-codex.sh"]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /9223/, `${file} still uses the legacy CDP port`);
  }
});

test("public metadata describes image-backed themes and ships the declared MIT license", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const license = readFileSync(join(root, "LICENSE"), "utf8");
  assert.match(readme, /custom image-backed themes/i);
  assert.doesNotMatch(readme, /custom AI-generated themes/i);
  assert.match(license, /^MIT License/m);
  assert.match(license, /Copyright \(c\) 2026 GptSkin contributors/);
});
