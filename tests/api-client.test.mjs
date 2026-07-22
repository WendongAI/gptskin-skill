import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const subject = await import("../scripts/lib/api-client.mjs").catch(() => ({}));

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("API client defaults to gptskin.best and sends the bearer key", async () => {
  const calls = [];
  const client = subject.createApiClient({
    apiKey: "sk-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({ credits: 42 });
    },
  });

  const result = await client.getCredits();

  assert.equal(subject.DEFAULT_SERVER_URL, "https://gptskin.best");
  assert.equal(result.credits, 42);
  assert.equal(calls[0].url, "https://gptskin.best/api/user/credits");
  assert.equal(calls[0].options.headers.Authorization, "Bearer sk-test");
});

test("custom themes have one canonical 20 Credit cost", () => {
  assert.equal(subject.CUSTOM_THEME_CREDITS, 20);
});

test("image upload sets MIME from file bytes", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gptskin-api-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const imagePath = join(root, "generated-image");
  writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));

  let uploadedFile;
  const client = subject.createApiClient({
    apiKey: "sk-test",
    fetchImpl: async (_url, options) => {
      uploadedFile = options.body.get("files");
      return jsonResponse({ data: { uploadKey: "uploads/user/source.png" } });
    },
  });

  const uploaded = await client.uploadImage(imagePath);

  assert.equal(uploaded.uploadKey, "uploads/user/source.png");
  assert.equal(uploadedFile.type, "image/png");
  assert.equal(uploadedFile.name, "generated-image.png");
});

test("unsupported image bytes are rejected before upload", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gptskin-api-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const imagePath = join(root, "not-an-image.bin");
  writeFileSync(imagePath, "not an image");

  let called = false;
  const client = subject.createApiClient({
    apiKey: "sk-test",
    fetchImpl: async () => {
      called = true;
      return jsonResponse({});
    },
  });

  await assert.rejects(() => client.uploadImage(imagePath), /PNG, JPEG, or WebP/i);
  assert.equal(called, false);
});

test("images over the Vercel-safe 4 MiB limit are rejected before upload", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gptskin-api-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const imagePath = join(root, "oversized.png");
  const bytes = Buffer.alloc(4 * 1024 * 1024 + 1);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  writeFileSync(imagePath, bytes);

  let called = false;
  const client = subject.createApiClient({
    apiKey: "sk-test",
    fetchImpl: async () => {
      called = true;
      return jsonResponse({});
    },
  });

  await assert.rejects(() => client.uploadImage(imagePath), /4 MiB/i);
  assert.equal(called, false);
});

test("compile sends uploadKey with a caller-owned stable Idempotency-Key", async () => {
  let request;
  const client = subject.createApiClient({
    apiKey: "sk-test",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ status: "completed", theme: { id: "theme_1" } }, 201);
    },
  });

  await client.compileTheme({
    uploadKey: "uploads/user/source.png",
    themeName: "Tokyo Night",
    idempotencyKey: "gptskin-request-stable",
  });

  assert.equal(request.url, "https://gptskin.best/api/themes/compile");
  assert.equal(request.options.headers["Idempotency-Key"], "gptskin-request-stable");
  assert.deepEqual(JSON.parse(request.options.body), {
    uploadKey: "uploads/user/source.png",
    themeName: "Tokyo Night",
  });
  assert.doesNotMatch(request.options.body, /imageUrl|prompt/);
});
