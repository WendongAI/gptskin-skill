import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function extensionForMime(mime) {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return "";
}

function assertSafeId(id) {
  if (!id || !SAFE_ID.test(id)) throw new Error("Invalid theme ID");
}

export function createThemeStore({ homeDir = process.env.GPTSKIN_HOME || homedir() } = {}) {
  const themesDir = join(homeDir, ".gptskin", "themes");
  const operationsDir = join(homeDir, ".gptskin", "operations");

  function save(theme) {
    assertSafeId(theme.id);
    const themeDir = join(themesDir, theme.id);
    mkdirSync(themeDir, { recursive: true, mode: 0o700 });
    chmodSync(themeDir, 0o700);

    let backgroundFile = null;
    if (theme.backgroundBytes || theme.backgroundPath) {
      const extension = extensionForMime(theme.backgroundMime) || extname(theme.backgroundPath || "");
      backgroundFile = `background${extension}`;
      const target = join(themeDir, backgroundFile);
      if (theme.backgroundBytes) writeFileSync(target, theme.backgroundBytes, { mode: 0o600 });
      else copyFileSync(theme.backgroundPath, target);
      chmodSync(target, 0o600);
    }

    const record = {
      id: theme.id,
      name: theme.name || theme.id,
      colors: theme.colors || [],
      css: theme.css || "",
      backgroundMime: theme.backgroundMime || null,
      backgroundSha256: theme.backgroundSha256 || null,
      backgroundFile,
      createdAt: theme.createdAt || new Date().toISOString(),
    };
    const metadataPath = join(themeDir, "theme.json");
    writeFileSync(metadataPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    chmodSync(metadataPath, 0o600);
    return hydrate(record, themeDir);
  }

  function hydrate(record, themeDir) {
    return {
      ...record,
      backgroundPath: record.backgroundFile ? join(themeDir, record.backgroundFile) : null,
    };
  }

  function findById(id) {
    assertSafeId(id);
    const themeDir = join(themesDir, id);
    const metadataPath = join(themeDir, "theme.json");
    if (!existsSync(metadataPath)) return null;
    return hydrate(JSON.parse(readFileSync(metadataPath, "utf8")), themeDir);
  }

  function list() {
    if (!existsSync(themesDir)) return [];
    return readdirSync(themesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name))
      .map((entry) => findById(entry.name))
      .filter(Boolean)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function saveOperation(operation) {
    assertSafeId(operation.requestId);
    mkdirSync(operationsDir, { recursive: true, mode: 0o700 });
    chmodSync(operationsDir, 0o700);
    const operationPath = join(operationsDir, `${operation.requestId}.json`);
    writeFileSync(operationPath, `${JSON.stringify(operation, null, 2)}\n`, { mode: 0o600 });
    chmodSync(operationPath, 0o600);
    return operation;
  }

  function findOperation(requestId) {
    assertSafeId(requestId);
    const operationPath = join(operationsDir, `${requestId}.json`);
    if (!existsSync(operationPath)) return null;
    return JSON.parse(readFileSync(operationPath, "utf8"));
  }

  function completeOperation(requestId, themeId) {
    const operation = findOperation(requestId);
    if (!operation) throw new Error("Paid theme operation was not found");
    return saveOperation({ ...operation, status: "completed", themeId });
  }

  return {
    themesDir,
    operationsDir,
    save,
    findById,
    list,
    saveOperation,
    findOperation,
    completeOperation,
  };
}

export function formatThemeList(themes) {
  if (!themes.length) return "No saved custom themes.";
  return themes.map((theme, index) => `${index + 1}. ${theme.name} [${theme.id}]`).join("\n");
}
