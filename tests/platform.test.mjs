import assert from "node:assert/strict";
import test from "node:test";

const subject = await import("../scripts/lib/platform.mjs").catch(() => ({}));

test("macOS adapter restarts Codex with CDP using argument arrays", async () => {
  const calls = [];
  const adapter = subject.createPlatformAdapter({
    platform: "darwin",
    env: {},
    exists: (path) => path === "/Applications/Codex.app",
    run: async (command, args) => calls.push({ kind: "run", command, args }),
    spawnDetached: (command, args) => calls.push({ kind: "spawn", command, args }),
  });

  await adapter.restartWithCdp(19123);

  assert.deepEqual(calls, [
    { kind: "run", command: "osascript", args: ["-e", "tell application \"Codex\" to quit"] },
    { kind: "spawn", command: "open", args: ["-a", "Codex", "--args", "--remote-debugging-port=19123"] },
  ]);
});

test("Windows adapter restarts the discovered executable with CDP", async () => {
  const calls = [];
  const codexPath = "C:\\Users\\dk\\AppData\\Local\\Programs\\Codex\\Codex.exe";
  const adapter = subject.createPlatformAdapter({
    platform: "win32",
    env: { LOCALAPPDATA: "C:\\Users\\dk\\AppData\\Local" },
    exists: (path) => path === codexPath,
    run: async (command, args) => calls.push({ kind: "run", command, args }),
    spawnDetached: (command, args) => calls.push({ kind: "spawn", command, args }),
  });

  await adapter.restartWithCdp(19123);

  assert.deepEqual(calls, [
    { kind: "run", command: "taskkill.exe", args: ["/IM", "Codex.exe", "/T", "/F"] },
    { kind: "spawn", command: codexPath, args: ["--remote-debugging-port=19123"] },
  ]);
});

test("Windows supports an explicit CODEX_APP_PATH override", async () => {
  const calls = [];
  const codexPath = "D:\\Apps\\Codex Preview\\Codex.exe";
  const adapter = subject.createPlatformAdapter({
    platform: "win32",
    env: { CODEX_APP_PATH: codexPath },
    exists: (path) => path === codexPath,
    run: async () => {},
    spawnDetached: (command, args) => calls.push({ command, args }),
  });

  await adapter.restartWithCdp(19199);

  assert.deepEqual(calls[0], { command: codexPath, args: ["--remote-debugging-port=19199"] });
});

test("macOS rejects an unsafe app name before building AppleScript", async () => {
  const calls = [];
  const unsafePath = "/Applications/Codex\" & do shell script \"whoami.app";
  const adapter = subject.createPlatformAdapter({
    platform: "darwin",
    env: { CODEX_APP_PATH: unsafePath },
    exists: (path) => path === unsafePath,
    run: async (command, args) => calls.push({ command, args }),
    spawnDetached: (command, args) => calls.push({ command, args }),
  });

  await assert.rejects(() => adapter.restartWithCdp(19123), /unsafe Codex app name/i);
  assert.deepEqual(calls, []);
});
