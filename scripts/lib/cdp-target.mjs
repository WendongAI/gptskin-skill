const KNOWN_CODEX_FEATURE = /\b(codex|chatgpt|openai)\b/i;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function hasLoopbackWebSocket(target) {
  try {
    const websocket = new URL(target.webSocketDebuggerUrl);
    return websocket.protocol === "ws:" && LOOPBACK_HOSTS.has(websocket.hostname);
  } catch {
    return false;
  }
}

function looksLikeCodex(target) {
  return KNOWN_CODEX_FEATURE.test(`${target.title || ""}\n${target.url || ""}`);
}

export function selectCodexTarget(targets) {
  const candidates = (Array.isArray(targets) ? targets : []).filter((target) => (
    target?.type === "page"
    && hasLoopbackWebSocket(target)
    && looksLikeCodex(target)
  ));
  if (candidates.length !== 1) {
    throw new Error(`No unique Codex page target; found ${candidates.length}`);
  }
  return candidates[0];
}
