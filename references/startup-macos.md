# macOS Startup And Connection

Resolve `agent-browser` before use:

```bash
if command -v agent-browser >/dev/null 2>&1; then
  AGENT_BROWSER="$(command -v agent-browser)"
elif [ -x /usr/local/bin/agent-browser ]; then
  AGENT_BROWSER=/usr/local/bin/agent-browser
else
  echo "agent-browser is not installed or is not available on PATH." >&2
  exit 1
fi
```

Start by checking the debug port:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN
```

If port `9222` is listening, identify the process:

```bash
ps -fp <pid>
```

Proceed only when it is the intended Chrome using `~/.chrome-agent-debug`. Verify the connection explicitly:

```bash
"$AGENT_BROWSER" --cdp 9222 get url
```

Use `--cdp 9222` explicitly on every subsequent `agent-browser` command.

If the port is not listening, verify Chrome and the profile:

```bash
ls -la "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ls -ld "$HOME/.chrome-agent-debug"
```

If the profile contains stale `SingletonCookie`, `SingletonLock`, or `SingletonSocket`, remove them only after confirming the referenced Chrome process is not alive and no dedicated-profile Chrome is running.

Launch via `open -na` so Chrome is detached from the agent's short-lived shell:

```bash
open -na "Google Chrome" --args \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-agent-debug" \
  --no-first-run \
  --new-window \
  about:blank
```

Poll `lsof -nP -iTCP:9222 -sTCP:LISTEN` until the listener appears, typically within 3-8 seconds. Re-check the owning process before verifying the connection with `"$AGENT_BROWSER" --cdp 9222 get url`. If startup exits without a listener, diagnose stale profile locks, wrong processes, or profile conflicts before retrying.
