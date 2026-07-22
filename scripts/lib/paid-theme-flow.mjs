import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { CUSTOM_THEME_CREDITS } from "./api-client.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function createThemeRequestIdentity(imagePath, themeName = "") {
  const imageBytes = readFileSync(imagePath);
  const requestHash = createHash("sha256")
    .update("gptskin-image-theme-v1\0")
    .update(themeName.trim())
    .update("\0")
    .update(imageBytes)
    .digest("hex");
  return {
    requestId: `request_${requestHash}`,
    idempotencyKey: `gptskin-${requestHash}`,
    sourceSha256: sha256(imageBytes),
  };
}

function decodeAndVerifyBackground(application) {
  if (!application.backgroundBase64 || !application.backgroundSha256) {
    throw new Error("Theme application artifact is missing background integrity metadata");
  }
  const backgroundBytes = Buffer.from(application.backgroundBase64, "base64");
  const actual = sha256(backgroundBytes);
  const expected = String(application.backgroundSha256).toLowerCase();
  if (actual !== expected) throw new Error("Background SHA-256 mismatch");
  return backgroundBytes;
}

function validateApplicationArtifact(application) {
  if (typeof application.css !== "string" || !application.css.includes("--color-token-")) {
    throw new Error("Theme application artifact is missing full Codex token CSS");
  }
  return decodeAndVerifyBackground(application);
}

export async function createPaidTheme({ client, store, imagePath, themeName = "" }) {
  const identity = createThemeRequestIdentity(imagePath, themeName);
  let operation = store.findOperation(identity.requestId);
  const recovered = Boolean(operation);
  let creditsBefore = null;

  if (operation?.status === "completed" && operation.themeId) {
    const savedTheme = store.findById(operation.themeId);
    if (savedTheme) return { theme: savedTheme, creditsBefore, recovered: true };
  }

  if (!operation) {
    const creditState = await client.getCredits();
    creditsBefore = Number(creditState.credits || 0);
    if (creditsBefore < CUSTOM_THEME_CREDITS) {
      throw new Error(`You need ${CUSTOM_THEME_CREDITS} Credits; current balance is ${creditsBefore}`);
    }

    const uploaded = await client.uploadImage(imagePath);
    operation = store.saveOperation({
      ...identity,
      uploadKey: uploaded.uploadKey,
      themeName,
      status: "pending",
    });
  }

  const compiled = await client.compileTheme({
    uploadKey: operation.uploadKey,
    themeName: operation.themeName,
    idempotencyKey: operation.idempotencyKey,
  });
  if (compiled.status === "failed" || !compiled.theme?.id) {
    throw new Error(compiled.error || compiled.message || "Theme compilation failed");
  }

  const application = await client.getThemeApplication(compiled.theme.id);
  const backgroundBytes = validateApplicationArtifact(application);
  const theme = store.save({
    id: compiled.theme.id,
    name: application.name || compiled.theme.name || themeName || compiled.theme.id,
    colors: application.colors || compiled.theme.colors || [],
    css: application.css || "",
    backgroundBytes,
    backgroundMime: application.backgroundMime || "image/webp",
    backgroundSha256: application.backgroundSha256,
  });
  store.completeOperation(identity.requestId, theme.id);

  return { theme, creditsBefore, response: compiled, recovered };
}

export async function resolveThemeForApply({ id, store, client }) {
  const local = store.findById(id);
  if (local) return local;
  const application = await client.getThemeApplication(id);
  validateApplicationArtifact(application);
  return application;
}
