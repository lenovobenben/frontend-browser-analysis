---
name: frontend-browser-analysis
description: Use when analyzing any web application's frontend behavior through the user's logged-in dedicated Chrome profile, including page runtime state, route/store/component data, DOM-accessibility tree, HTTP data sources, certificate-gated internal pages, and collaborative exploration. Enforces robust Chrome debug-port startup/reuse, agent-browser inspection, user-led business navigation, no speculative clicks, no DevTools/CDP for ordinary analysis, successful data loading despite certificate interstitials, safe runtime-state summaries, and read-only API replay only when needed.
---

# Frontend Browser Analysis

## Purpose

Use the user's dedicated Chrome profile and `/usr/local/bin/agent-browser` to analyze frontend behavior on arbitrary websites and internal systems while preserving saved passwords, browser sync, cookies, and long-lived login sessions. This skill is for collaborative frontend runtime analysis: the user positions the page and provides business context; the agent reads page structure, runtime state, network/resource data, and visible UI behavior.

Do not use this as a generic browser autopilot. The valuable work is explaining how the page is produced: route, component state, store data, visible UI, request parameters, response summaries, and frontend transforms.

## Dedicated Browser

Use the shared dedicated Chrome profile:

```bash
"$HOME/.chrome-agent-debug"
```

This profile carries saved passwords and login state. Avoid fresh browser profiles because they force repeated manual logins and lose the user's prepared state.

Use direct Chrome startup only when no suitable browser is already running. Do not rely on shell aliases or functions.

## Startup And Connection

Do not run bare `agent-browser get url`, `tab list`, `snapshot`, or `open` before connecting to port `9222` when using the dedicated profile. Without an explicit connection, `agent-browser` may attach to or create a temporary browser that lacks the user's login state.

Start by checking the debug port:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN
```

If port `9222` is listening, identify the process:

```bash
ps -fp <pid>
```

If it is the intended Chrome using `~/.chrome-agent-debug`, connect:

```bash
/usr/local/bin/agent-browser connect 9222
```

If the command contains `--no-startup-window`, treat it as a Chrome background-restart state, not as headless mode. The browser may have no visible windows while the app remains alive. Report that state to the user instead of describing it as malware or silently launching a second Chrome.

Then inspect:

```bash
/usr/local/bin/agent-browser get url
/usr/local/bin/agent-browser tab list
/usr/local/bin/agent-browser snapshot --compact --depth 8
```

If port `9222` is occupied by a wrong process, report the PID and command before disrupting it. Do not launch another competing browser on the same port.

If port `9222` is not listening, verify Chrome and the profile:

```bash
ls -la "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ls -ld "$HOME/.chrome-agent-debug"
```

If the profile contains stale `SingletonCookie`, `SingletonLock`, or `SingletonSocket`, remove them only after confirming the referenced Chrome process is not alive and no dedicated-profile Chrome is running.

Start Chrome at most once. The dedicated Chrome is a long-lived session: start it once, leave it running across tasks, and reconnect on subsequent invocations rather than launching repeatedly.

On macOS, launch via `open -na` so the process is detached from the agent's short-lived shell:

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

After launching, poll `lsof -nP -iTCP:9222 -sTCP:LISTEN` until the listener appears (typically 3-8 seconds) before connecting. If startup exits without a listener, diagnose stale profile locks, wrong processes, or profile conflicts before retrying.

`--disable-features=SmartRestart` applies only to this dedicated automation profile. Keep it present so a Chrome update does not relaunch a zero-window debug process with `--no-startup-window`.

## Manual Shutdown

Long-lived means "reuse by default", not "prevent the user from quitting". When the user explicitly asks to close the dedicated browser, run the bundled shutdown helper from the installed skill root:

```bash
"$HOME/.codex/skills/frontend-browser-analysis/scripts/stop_dedicated_chrome.sh"
```

The helper must remain narrowly scoped to port `9222` and `~/.chrome-agent-debug`. It verifies the listener's executable, profile, and debug-port arguments before acting. It first releases the `agent-browser` CDP session and then, if the externally launched Chrome remains alive, sends the normal termination signal `SIGTERM`. It never sends `SIGKILL` and refuses to act when process identity is ambiguous or mismatched.

After the helper returns, verify both conditions:

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN
pgrep -fl '/Applications/[G]oogle Chrome.app/Contents/MacOS/Google Chrome.*--user-data-dir=.*/.chrome-agent-debug'
```

Do not run the helper merely because an analysis task ended. Run it when the user asks to close the dedicated browser or has stated a close-after-use preference.

## Collaboration Boundary

Default to user-led operation:

- Let the user handle login, account selection, product/site navigation, business-specific choices, and high-risk UI operations.
- Observe first when the user says they have positioned the page.
- Ask the user to navigate when the next step depends on business meaning.
- Perform clicks only when the user names the exact target or when a low-risk click is necessary for data collection or retry.

High-risk actions require explicit user approval: submit, save, create, update, delete, import, export, publish, approve, reject, start, stop, restart, release, payment, permission changes, forms, toggles, and any action with business side effects.

## Interaction Guardrails

- Prefer page-derived URLs. Before navigating inside an application, use links, menu hrefs, form actions, or runtime route state already present on the page. Only infer or hand-build a URL when no page-derived target is available, and say that it is inferred.
- Verify after side effects. After saving, uploading, submitting, toggling, or filling important fields, confirm the result with state text, field values, button state, URL changes, or error dialogs instead of relying only on fixed waits.
- Handle custom controls with fallbacks. For Material UI, Ant Design, or similar custom controls, try accessibility refs first, then role/name targeting, then targeted DOM interaction, then coordinates. After any fallback, verify the final displayed value.
- Treat high-risk confirmation dialogs as a separate approval point. Read the dialog text, checkbox state, and button labels, explain the effect to the user, and wait for explicit approval before confirming.

## Certificate Gates

Internal, preprod, and integration systems may have broken, self-signed, expired, or mismatched certificates. The task is not complete until the browser can load the real page data.

If Chrome shows a certificate interstitial such as "Your connection is not private" or "忽略风险，继续访问":

- Treat it as a browser access gate, not as product evidence.
- Clear the interstitial and continue when the environment is known to be internal/preprod/integration.
- Wait for the real application to load.
- Re-check URL, route, account/site context, page state, and requests.
- Analyze only after the application page and XHR/fetch requests are actually flowing.

Do not stop at "certificate error" when the user needs data. If `agent-browser` cannot clear the gate, diagnose the blocker and ask the user only for the minimal browser action needed to continue. Do not treat blank pages, missing UI, or failed XHRs caused by certificate blocking as valid frontend or backend evidence.

For shell-only static checks, `curl -k` is acceptable. For browser analysis, clear the interstitial in Chrome so the actual browser session performs subsequent page requests.

## Analysis Workflow

For any visible field, page section, table, chart, tab, modal, or error:

1. Confirm the current URL, title, route params, account/site context, and target resource id if present.
2. Take a compact snapshot of the visible target area.
3. Inspect runtime state with targeted `eval`: route, store, component names, selected fields, table data, filters, tabs, and error state.
4. Inspect network history:

```bash
/usr/local/bin/agent-browser network requests --filter 'Describe|List|Get|Query|Search|Fetch|Load|Graph|Metric|Config'
```

5. If network history has no useful body data, inspect resource timing:

```bash
/usr/local/bin/agent-browser eval '(() => performance.getEntriesByType("resource").filter(e => /xhr|fetch|api|graphql|query|list|describe|get|search/i.test(e.name)).map(e => ({name: e.name, initiatorType: e.initiatorType, startTime: Math.round(e.startTime), duration: Math.round(e.duration)})).slice(-80))()'
```

6. Map visible UI to component state, then component state to API request/response fields and frontend transforms.
7. Report concise evidence: visible field -> state field -> interface -> request params -> response field.

Do not assume one visible section equals one API. Modern pages often compose one area from multiple APIs, cached state, dictionaries, permissions, and frontend formatting.

## Runtime State Discipline

Do not dump whole framework objects. Vue, React, Angular, and UI component instances contain cycles, DOM nodes, framework internals, and large nested data.

Extract only:

- route/location context.
- store or global state keys that matter.
- component name, short class, and short visible text.
- selected business fields relevant to the marked area.
- array lengths and first 1-3 item samples.
- object keys and a small safe sample.

Skip or redact fields whose names contain `password`, `secret`, `token`, `credential`, `private_key`, `access_key`, `session`, `cookie`, or similar sensitive terms.

Useful Vue pattern:

```bash
/usr/local/bin/agent-browser eval '(() => { const out=[]; for (const el of document.querySelectorAll("*")) { const vm=el.__vue__; if (!vm) continue; const text=(el.innerText||"").trim(); const name=vm.$options && (vm.$options.name || vm.$options._componentTag); if (!text && !name) continue; out.push({name, tag: el.tagName, cls: String(el.className||"").slice(0,80), text: text.slice(0,300), route: vm.$route && {path: vm.$route.path, params: vm.$route.params, query: vm.$route.query}}); if (out.length >= 30) break; } return out; })()'
```

## Read-Only API Replay

If the page runtime exposes API wrappers and network history lacks response bodies, replay only read-only calls using the current route/store/page params.

Allowed read-only prefixes are generally:

```text
describe, list, get, query, fetch, search, load
```

Never call write or control APIs unless the user explicitly approves the exact operation. Treat these as write/control even in preprod:

```text
create, update, delete, modify, import, export, submit, save, start, stop, restart, reboot, release, reconfig, scale, open, close, enable, disable, bind, unbind
```

After replaying a read-only API, say that the response was fetched through the page runtime for verification. Include request params and a bounded response summary, not a full unbounded payload.

## Output Style

Lead with the conclusion. Then give the evidence needed for the user to verify it:

- current URL/context.
- key runtime state.
- relevant interface names and request params.
- response field summaries.
- frontend transform or condition if visible.

When context is wrong, stale, certificate-blocked, or missing data, state that directly and do not infer product behavior from invalid evidence.
