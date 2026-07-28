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

If the browser command contains `--no-startup-window`, treat it as a Chrome background-restart state, not as headless mode. The browser may have no visible windows while its process and debug port remain alive. Report that state instead of describing it as malware or silently launching a second Chrome.

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
  --disable-features=SmartRestart \
  --no-first-run \
  --new-window \
  about:blank
```

Poll `lsof -nP -iTCP:9222 -sTCP:LISTEN` until the listener appears, typically within 3-8 seconds. Re-check the owning process before verifying the connection with `"$AGENT_BROWSER" --cdp 9222 get url`. If startup exits without a listener, diagnose stale profile locks, wrong processes, or profile conflicts before retrying.

Keep `--disable-features=SmartRestart` on this dedicated profile so Chrome cannot relaunch it as a zero-window debug process during a browser update.

## Manual Shutdown

When the user explicitly asks to close the dedicated browser, run the bundled helper from the installed skill root:

```bash
"$HOME/.codex/skills/frontend-browser-analysis/scripts/stop_dedicated_chrome.sh"
```

The helper is narrowly scoped to port `9222` and `~/.chrome-agent-debug`. It verifies the listener's executable, profile, and debug-port arguments before acting. It first releases the `agent-browser` CDP session and then, if the externally launched Chrome remains alive, sends `SIGTERM` only to the verified browser process. It never sends `SIGKILL` and refuses to act when process identity is ambiguous or mismatched.

After the helper returns, verify that neither the listener nor the dedicated-profile browser remains:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN
pgrep -fl '/Applications/[G]oogle Chrome.app/Contents/MacOS/Google Chrome.*--user-data-dir=.*/.chrome-agent-debug'
```

Do not run the helper merely because an analysis task ended. Run it only when the user asks to close the browser or has stated a close-after-use preference.
