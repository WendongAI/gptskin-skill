#!/bin/bash
# Restart Codex with remote debugging port for CSS injection
CDP_PORT="${GPTSKIN_CDP_PORT:-19123}"

# Check if already running with CDP
if curl -s --connect-timeout 1 "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; then
  echo "Codex CDP already available on port $CDP_PORT"
  exit 0
fi

# Kill existing Codex
echo "Restarting Codex with CDP support..."
osascript -e 'quit app "ChatGPT"' 2>/dev/null
sleep 2

# Restart with debugging port
open -a "ChatGPT" --args --remote-debugging-port=$CDP_PORT

# Wait for CDP to become available
for i in $(seq 1 20); do
  sleep 1
  if curl -s --connect-timeout 1 "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; then
    echo "Codex CDP ready on port $CDP_PORT"
    exit 0
  fi
done

echo "Warning: Codex started but CDP not available on port $CDP_PORT"
exit 1
