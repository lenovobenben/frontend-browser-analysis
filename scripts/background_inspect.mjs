#!/usr/bin/env node

// Inspect an existing Chrome page without creating or activating a target.
const endpoint = 'http://127.0.0.1:9222/json/list';
const [command, targetId, expression] = process.argv.slice(2);
const maxOutput = 30000;

function usage() {
  throw new Error('Usage: background_inspect.mjs list | info <target-id> | snapshot <target-id> | eval <target-id> <read-only-expression>');
}

function cleanUrl(raw) {
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return String(raw).split(/[?#]/, 1)[0].slice(0, 300);
  }
}

function print(value) {
  const output = JSON.stringify(value, null, 2);
  process.stdout.write(output.slice(0, maxOutput) + (output.length > maxOutput ? '\n…truncated' : '') + '\n');
}

async function targets() {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Chrome target discovery failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error('Chrome target list is invalid');
  return body.filter(item => item.type === 'page');
}

async function send(page, method, params = {}) {
  const address = new URL(page.webSocketDebuggerUrl);
  if (address.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(address.hostname) ||
      address.port !== '9222' || address.pathname !== `/devtools/page/${page.id}`) {
    throw new Error('Refusing a non-local or mismatched page WebSocket');
  }

  const socket = new WebSocket(address.href);
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Page WebSocket connection timed out')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Page WebSocket connection failed')); }, { once: true });
    });
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${method} timed out`)), 10000);
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error(`${method} failed`)); }, { once: true });
      socket.send(JSON.stringify({ id: 1, method, params }));
    });
  } finally {
    socket.close();
  }
}

async function evaluate(page, source) {
  const response = await send(page, 'Runtime.evaluate', {
    expression: source,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'JavaScript evaluation failed');
  }
  if (response.result?.type === 'undefined') return null;
  if (!Object.hasOwn(response.result ?? {}, 'value')) {
    throw new Error('Expression returned a value that cannot be serialized; select bounded fields');
  }
  return response.result.value;
}

async function main() {
  if (!['list', 'info', 'snapshot', 'eval'].includes(command)) usage();
  if (command === 'list' && (targetId || expression)) usage();
  if (command !== 'list' && !targetId) usage();
  if (command === 'eval' && !expression) usage();
  if (command !== 'eval' && expression) usage();

  const pages = await targets();
  if (command === 'list') {
    print(pages.map(page => ({ id: page.id, title: String(page.title ?? '').slice(0, 180), url: cleanUrl(page.url) })));
    return;
  }

  const page = pages.find(item => item.id === targetId);
  if (!page) throw new Error('Target id is not an existing page on local port 9222');

  if (command === 'info') {
    print(await evaluate(page, '({title: document.title, url: location.origin + location.pathname, readyState: document.readyState, visibilityState: document.visibilityState})'));
  } else if (command === 'eval') {
    print(await evaluate(page, expression));
  } else {
    const result = await send(page, 'Accessibility.getFullAXTree', { depth: 8 });
    print((result.nodes ?? []).filter(node => !node.ignored).slice(0, 180).map(node => ({
      role: node.role?.value,
      name: String(node.name?.value ?? '').slice(0, 250),
      value: String(node.value?.value ?? '').slice(0, 250),
      level: node.properties?.find(property => property.name === 'level')?.value?.value,
    })));
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
