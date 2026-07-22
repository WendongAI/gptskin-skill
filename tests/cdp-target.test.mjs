import assert from "node:assert/strict";
import test from "node:test";

const subject = await import("../scripts/lib/cdp-target.mjs").catch(() => ({}));

test("selects the unique Codex page with a loopback websocket", () => {
  const codex = {
    id: "codex-main",
    type: "page",
    title: "Codex",
    url: "file:///Applications/Codex.app/index.html",
    webSocketDebuggerUrl: "ws://127.0.0.1:19123/devtools/page/codex-main",
  };
  const selected = subject.selectCodexTarget([
    { ...codex, id: "devtools", type: "other", title: "Codex DevTools" },
    {
      id: "remote",
      type: "page",
      title: "ChatGPT",
      url: "https://chatgpt.com/",
      webSocketDebuggerUrl: "ws://192.168.1.50:19123/devtools/page/remote",
    },
    codex,
  ]);

  assert.equal(selected, codex);
});

test("rejects an arbitrary Electron page even on loopback", () => {
  assert.throws(
    () => subject.selectCodexTarget([{
      id: "other-app",
      type: "page",
      title: "Notes",
      url: "file:///Applications/Notes.app/index.html",
      webSocketDebuggerUrl: "ws://127.0.0.1:19123/devtools/page/other-app",
    }]),
    /no unique Codex page target/i,
  );
});

test("fails closed when more than one known Codex page is eligible", () => {
  assert.throws(
    () => subject.selectCodexTarget([
      {
        id: "one",
        type: "page",
        title: "Codex",
        url: "file:///Applications/Codex.app/index.html",
        webSocketDebuggerUrl: "ws://localhost:19123/devtools/page/one",
      },
      {
        id: "two",
        type: "page",
        title: "OpenAI Codex",
        url: "https://chatgpt.com/codex",
        webSocketDebuggerUrl: "ws://[::1]:19123/devtools/page/two",
      },
    ]),
    /no unique Codex page target.*found 2/i,
  );
});

test("fails closed when the known page websocket is not loopback", () => {
  assert.throws(
    () => subject.selectCodexTarget([{
      id: "remote",
      type: "page",
      title: "Codex",
      url: "https://chatgpt.com/codex",
      webSocketDebuggerUrl: "wss://example.com/devtools/page/remote",
    }]),
    /no unique Codex page target/i,
  );
});
