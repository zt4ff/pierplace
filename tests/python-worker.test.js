import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/python/python.worker.js', import.meta.url), 'utf8');
function harness({ execute = () => {}, failLoading = false } = {}) {
  const messages = [];
  const namespaces = [];
  const runtime = {
    setStdout(handler) { this.stdout = handler.write; },
    setStderr(handler) { this.stderr = handler.write; },
    setStdin(handler) { this.stdin = handler.stdin; },
    toPy(values) { const namespace = { ...values, destroyed: false, destroy() { this.destroyed = true; } }; namespaces.push(namespace); return namespace; },
    async runPythonAsync(code, { globals }) { return execute(code, globals, this); },
    runPython() { this.flushed = true; },
  };
  const self = { postMessage(message) { messages.push(structuredClone(message)); }, async loadPyodide() { if (failLoading) throw new Error('offline'); return runtime; } };
  runInNewContext(source, { self, TextDecoder, importScripts() {} });
  return { self, runtime, messages, namespaces, async send(message) { await self.onmessage({ data: message }); } };
}
const bytes = text => new TextEncoder().encode(text);

test('Python worker forwards exact output, stderr and input and cleans up each namespace', async () => {
  const h = harness({ execute(code, globals, runtime) {
    assert.equal(code, 'basic python');
    assert.equal(globals.__name__, '__main__');
    assert.equal(runtime.stdin(), 'Ada');
    assert.equal(runtime.stdin(), '42');
    assert.equal(runtime.stdin(), null);
    assert.equal(runtime.stdout(bytes('Hello, ')), 7);
    runtime.stdout(bytes('Ada!\n'));
    runtime.stderr(bytes('a warning\n'));
    return { destroy() { runtime.resultDestroyed = true; } };
  } });
  await h.send({ type: 'init' });
  await h.send({ type: 'run', id: 1, code: 'basic python', input: 'Ada\r\n42' });
  assert.deepEqual(h.messages, [{ type: 'ready' }, { type: 'output', id: 1, text: 'Hello, Ada!\na warning\n' }, { type: 'done', id: 1 }]);
  assert.equal(h.runtime.flushed, true);
  assert.equal(h.runtime.resultDestroyed, true);
  assert.equal(h.namespaces[0].destroyed, true);
});

test('Python worker retains output before exceptions and releases failed namespaces', async () => {
  const h = harness({ execute(code, globals, runtime) { runtime.stdout(bytes('before error\n')); throw new Error('ZeroDivisionError: division by zero'); } });
  await h.send({ type: 'init' });
  await h.send({ type: 'run', id: 8, code: 'print(1 / 0)', input: '' });
  assert.deepEqual(h.messages[1], { type: 'output', id: 8, text: 'before error\n' });
  assert.equal(h.messages[2].type, 'error');
  assert.equal(h.messages[2].id, 8);
  assert.match(h.messages[2].message, /ZeroDivisionError/);
  assert.equal(h.namespaces[0].destroyed, true);
  assert.equal(h.runtime.flushed, true);
});

test('Python worker uses a fresh namespace and stdin for every run', async () => {
  const h = harness({ execute(code, globals, runtime) { assert.equal(globals.previous, undefined); globals.previous = true; assert.equal(runtime.stdin(), code === 'first' ? 'Ada' : null); } });
  await h.send({ type: 'init' });
  await h.send({ type: 'run', id: 1, code: 'first', input: 'Ada' });
  await h.send({ type: 'run', id: 2, code: 'second', input: '' });
  assert.notEqual(h.namespaces[0], h.namespaces[1]);
  assert.ok(h.namespaces.every(namespace => namespace.destroyed));
  assert.deepEqual(h.messages.filter(message => message.type === 'done').map(message => message.id), [1, 2]);
});

test('Python worker preserves Unicode split across writes and output without a trailing newline', async () => {
  const h = harness({ execute(code, globals, runtime) { const data = bytes('Hello 🌍'); runtime.stdout(data.slice(0, 8)); runtime.stdout(data.slice(8)); } });
  await h.send({ type: 'init' });
  await h.send({ type: 'run', id: 1, code: 'print("Hello 🌍", end="")', input: '' });
  assert.equal(h.messages.find(message => message.type === 'output').text, 'Hello 🌍');
});

test('Python worker bounds output and reports truncation once', async () => {
  const h = harness({ execute(code, globals, runtime) { for (let i = 0; i < 1000; i++) runtime.stdout(bytes('x'.repeat(1000))); } });
  await h.send({ type: 'init' });
  await h.send({ type: 'run', id: 1, code: 'lots of output', input: '' });
  const text = h.messages.filter(message => message.type === 'output').map(message => message.text).join('');
  assert.equal(text, 'x'.repeat(64000) + '\n[Output truncated at 64,000 characters.]\n');
  assert.ok(h.messages.length < 30);
});

test('Python worker reports an actionable runtime download failure', async () => {
  const h = harness({ failLoading: true });
  await h.send({ type: 'init' });
  assert.equal(h.messages[0].type, 'error');
  assert.equal(h.messages[0].id, null);
  assert.match(h.messages[0].message, /internet connection/);
});
