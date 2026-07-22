import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

export const DEFAULT_SERVER_URL = "https://gptskin.best";
export const CUSTOM_THEME_CREDITS = 20;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = [
  {
    mime: "image/png",
    extension: ".png",
    matches: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    extension: ".jpg",
    matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    mime: "image/webp",
    extension: ".webp",
    matches: (bytes) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
  },
];

export function detectImageType(bytes) {
  return IMAGE_TYPES.find((candidate) => candidate.matches(bytes)) || null;
}

function normalizeServerUrl(serverUrl) {
  return (serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, "");
}

async function parseResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text } : {};
}

export function createApiClient({
  serverUrl = DEFAULT_SERVER_URL,
  apiKey = "",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is required");
  const baseUrl = normalizeServerUrl(serverUrl);

  async function request(path, options = {}) {
    const headers = { ...options.headers };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (typeof options.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetchImpl(`${baseUrl}${path}`, { ...options, headers });
    const data = await parseResponse(response);
    if (!response.ok) {
      const message = data.error || data.message || `GptSkin API request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  return {
    request,
    getCredits: () => request("/api/user/credits"),
    listThemes: () => request("/api/themes"),
    getThemeApplication: (id) => request(`/api/themes/${encodeURIComponent(id)}/css`),
    async uploadImage(imagePath) {
      const bytes = readFileSync(imagePath);
      const imageType = detectImageType(bytes);
      if (!imageType) throw new Error("Only PNG, JPEG, or WebP images are supported");
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new Error("Image exceeds the 4 MiB upload limit; resize or compress it first");
      }

      const originalExtension = extname(imagePath);
      const fileName = `${basename(imagePath, originalExtension)}${imageType.extension}`;
      const form = new FormData();
      form.append("files", new Blob([bytes], { type: imageType.mime }), fileName);
      const data = await request("/api/storage/upload-image", { method: "POST", body: form });
      const uploadKey = data.data?.uploadKey;
      if (!uploadKey) throw new Error(data.error || data.message || "Image upload returned no uploadKey");
      return {
        uploadKey,
        mime: imageType.mime,
      };
    },
    compileTheme({ uploadKey, themeName, idempotencyKey }) {
      if (!uploadKey) throw new Error("uploadKey is required");
      if (!idempotencyKey) throw new Error("A stable Idempotency-Key is required");
      return request("/api/themes/compile", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ uploadKey, themeName: themeName || undefined }),
      });
    },
  };
}
