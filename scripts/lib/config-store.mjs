import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_CONFIG = Object.freeze({
  serverUrl: "https://gptskin.best",
  apiKey: "",
});

export function createConfigStore({ homeDir = process.env.GPTSKIN_HOME || homedir() } = {}) {
  const configDir = join(homeDir, ".gptskin");
  const configPath = join(configDir, "config.json");

  function load() {
    if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };
    try {
      const saved = JSON.parse(readFileSync(configPath, "utf8"));
      return {
        serverUrl: saved.serverUrl || DEFAULT_CONFIG.serverUrl,
        apiKey: typeof saved.apiKey === "string" ? saved.apiKey : "",
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function save(config) {
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    chmodSync(configDir, 0o700);
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    chmodSync(configPath, 0o600);
  }

  async function saveApiKeyIfValid(candidate, validate) {
    const apiKey = typeof candidate === "string" ? candidate.trim() : "";
    if (!apiKey || typeof validate !== "function") return false;
    try {
      if (!(await validate(apiKey))) return false;
    } catch {
      return false;
    }
    save({ ...load(), apiKey });
    return true;
  }

  return { configDir, configPath, load, saveApiKeyIfValid };
}
