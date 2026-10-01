#!/usr/bin/env node

// Navigate and interact with an existing dedicated Chrome without activating it.
const endpoint = 'http://127.0.0.1:9222';
const [command, targetId, label, ...extra] = process.argv.slice(2);
const commands = new Set(['open-link', 'navigate-link', 'click-control']);

if (!commands.has(command) || !targetId || !label || extra.length) {
  process.stderr.write('Usage: background_act.mjs <open-link|navigate-link|click-control> <target-id> <exact-visible-label>\n');
  process.exit(2);
}

function safeUrl(raw) {
  const url = new URL(raw);
  return url.origin + url.pathname;
}

function checkSocket(raw, path) {
  const url = new URL(raw);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port !== '9222' || url.pathname !== path) {
    throw new Error('Refusing a non-local or mismatched CDP WebSocket');
  }
  return url.href;
}

async function connect(raw, path) {
  const socket = new WebSocket(checkSocket(raw, path));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP connection timed out')), 5000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')); }, { once: true });
  });
  return socket;
}

let sequence = 0;
function send(socket, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`${method} timed out`));
    }, 10000);
    function onMessage(event) {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id !== id) return;
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    }
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(socket, expression) {
  const reply = await send(socket, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  });
  if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text || 'Page evaluation failed');
  return reply.result?.value;
}

async function getPages() {
  const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Chrome target discovery failed: HTTP ${response.status}`);
  const pages = await response.json();
  if (!Array.isArray(pages)) throw new Error('Chrome target list is invalid');
  return pages.filter(page => page.type === 'page');
}

const linkExpression = `(() => {
  const wanted = ${JSON.stringify(label)};
  const norm = text => String(text || '').replace(/\\s+/g, ' ').trim();
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => el.getClientRects().length);
  const matches = [...document.querySelectorAll('a[href]')].filter(a =>
    a.getClientRects().length && (!dialog || dialog.contains(a)) &&
    (norm(a.innerText) === wanted || norm(a.getAttribute('aria-label')) === wanted));
  if (matches.length !== 1) return {error: 'Expected one visible link with that exact label', count: matches.length};
  const a = matches[0];
  const url = new URL(a.href, location.href);
  if (!['http:', 'https:'].includes(url.protocol) || a.hasAttribute('download'))
    return {error: 'This link is not a normal HTTP navigation'};
  return {href: url.href, target: a.target};
})()`;

const clickExpression = `(() => {
  const wanted = ${JSON.stringify(label)};
  const norm = text => String(text || '').replace(/\\s+/g, ' ').trim();
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find(el => el.getClientRects().length);
  const matches = [...document.querySelectorAll('button,[role="button"],[role="tab"],[role="menuitem"]')]
    .filter(el => el.tagName !== 'A' && el.getClientRects().length && (!dialog || dialog.contains(el)) &&
      (norm(el.innerText) === wanted || norm(el.getAttribute('aria-label')) === wanted));
  if (matches.length !== 1) return {error: 'Expected one visible control with that exact label', count: matches.length};
  const el = matches[0];
  if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('form'))
    return {error: 'Disabled or form control; handle this action separately'};
  const beforePath = location.pathname;
  const beforeVisibility = document.visibilityState;
  el.click();
  return {clicked: true, tag: el.tagName, role: el.getAttribute('role'),
    beforePath, afterPath: location.pathname, beforeVisibility, afterVisibility: document.visibilityState};
})()`;

async function main() {
  const pages = await getPages();
  const page = pages.find(item => item.id === targetId);
  if (!page) throw new Error('Target id is not an existing page on local port 9222');
  const pageSocket = await connect(page.webSocketDebuggerUrl, `/devtools/page/${targetId}`);
  try {
    const before = await evaluate(pageSocket, '({path:location.pathname,visibility:document.visibilityState})');
    if (command === 'click-control') {
      const result = await evaluate(pageSocket, clickExpression);
      if (result?.error) throw new Error(result.error + (result.count === undefined ? '' : ` (${result.count} matches)`));
      await new Promise(resolve => setTimeout(resolve, 200));
      const afterPages = await getPages();
      const unexpectedNewTabs = afterPages.filter(item => !pages.some(old => old.id === item.id)).length;
      console.log(JSON.stringify({action: command, targetId, label, ...result, unexpectedNewTabs}));
      if (unexpectedNewTabs || result.afterVisibility !== before.visibility)
        throw new Error('Browser target or visibility changed unexpectedly; stop and inspect');
      return;
    }

    const link = await evaluate(pageSocket, linkExpression);
    if (link?.error) throw new Error(link.error + (link.count === undefined ? '' : ` (${link.count} matches)`));
    if (command === 'navigate-link') {
      await send(pageSocket, 'Page.navigate', { url: link.href });
      console.log(JSON.stringify({action: command, targetId, label, path: safeUrl(link.href),
        sourceVisibilityBefore: before.visibility}));
      return;
    }

    const versionResponse = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(5000) });
    if (!versionResponse.ok) throw new Error('Chrome browser target discovery failed');
    const version = await versionResponse.json();
    const browserSocket = await connect(version.webSocketDebuggerUrl, '/devtools/browser/' +
      new URL(version.webSocketDebuggerUrl).pathname.split('/').pop());
    try {
      const created = await send(browserSocket, 'Target.createTarget', {
        url: link.href,
        background: true,
        newWindow: false,
      });
      const after = await evaluate(pageSocket, 'document.visibilityState');
      console.log(JSON.stringify({action: command, sourceId: targetId, targetId: created.targetId,
        label, path: safeUrl(link.href), sourceVisibilityBefore: before.visibility,
        sourceVisibilityAfter: after}));
      if (after !== before.visibility) throw new Error('Source tab visibility changed unexpectedly; stop and inspect');
    } finally {
      browserSocket.close();
    }
  } finally {
    pageSocket.close();
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
