import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, win32 } from "node:path";

function defaultRun(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 10_000 }, (error) => (error ? reject(error) : resolve()));
  });
}

function defaultSpawnDetached(command, args) {
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

function validatePort(port) {
  if (!Number.isInteger(port) || port < 19100 || port > 19199) {
    throw new Error("CDP port must be between 19100 and 19199");
  }
}

function resolveMacApp({ env, exists }) {
  let appName;
  if (env.CODEX_APP_PATH && exists(env.CODEX_APP_PATH)) {
    appName = basename(env.CODEX_APP_PATH, ".app");
  } else {
    const candidates = [
      ["/Applications/Codex.app", "Codex"],
      ["/Applications/ChatGPT.app", "ChatGPT"],
    ];
    const match = candidates.find(([path]) => exists(path));
    if (!match) throw new Error("Codex desktop app not found. Set CODEX_APP_PATH to the .app path.");
    appName = match[1];
  }
  if (!/^[a-zA-Z0-9 ._-]+$/.test(appName)) throw new Error("Unsafe Codex app name");
  return appName;
}

function resolveWindowsExecutable({ env, exists }) {
  const candidates = [
    env.CODEX_APP_PATH,
    env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, "Programs", "Codex", "Codex.exe"),
    env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, "Programs", "OpenAI Codex", "Codex.exe"),
    env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, "Programs", "ChatGPT", "ChatGPT.exe"),
  ].filter(Boolean);
  const executable = candidates.find((path) => exists(path));
  if (!executable) throw new Error("Codex desktop app not found. Set CODEX_APP_PATH to Codex.exe.");
  return executable;
}

export function createPlatformAdapter({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  run = defaultRun,
  spawnDetached = defaultSpawnDetached,
} = {}) {
  return {
    async restartWithCdp(port) {
      validatePort(port);
      if (platform === "darwin") {
        const appName = resolveMacApp({ env, exists });
        await run("osascript", ["-e", `tell application \"${appName}\" to quit`]).catch(() => {});
        spawnDetached("open", ["-a", appName, "--args", `--remote-debugging-port=${port}`]);
        return;
      }
      if (platform === "win32") {
        const executable = resolveWindowsExecutable({ env, exists });
        await run("taskkill.exe", ["/IM", win32.basename(executable), "/T", "/F"]).catch(() => {});
        spawnDetached(executable, [`--remote-debugging-port=${port}`]);
        return;
      }
      throw new Error(`GptSkin currently supports macOS and Windows; got ${platform}`);
    },
  };
}
