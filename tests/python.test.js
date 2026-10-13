import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PythonRunner } from '../src/python/runner.js';

class MockWorker {
  constructor() {
    this.messages = [];
    this.terminated = false;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  emit(message) {
    this.onmessage?.({ data: message });
  }

  terminate() {
    this.terminated = true;
  }

  get runMessage() {
    return this.messages.findLast((message) => message.type === 'run');
  }

  done() {
    this.emit({ type: 'done', id: this.runMessage.id });
  }
}

function setup(t, options) {
  const workers = [];
  const runner = new PythonRunner(() => {
    const worker = new MockWorker();
    workers.push(worker);
    return worker;
  }, options);
  t.after(() => runner.dispose());
  return { runner, workers };
}

async function retrySuccessfully(runner, workers) {
  const count = workers.length;
  const promise = runner.run('pass', '');
  assert.equal(workers.length, count + 1);
  const worker = workers.at(-1);
  assert.deepEqual(worker.messages, [{ type: 'init' }]);
  worker.emit({ type: 'ready' });
  worker.done();
  await promise;
}

function assertCleaned(worker) {
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
  assert.equal(worker.onerror, null);
  assert.equal(worker.onmessageerror, null);
}

test('creates the worker lazily and waits for ready before executing', async (t) => {
  const { runner, workers } = setup(t);
  assert.equal(workers.length, 0);
  assert.equal(runner.initTimeoutMs, 60_000);
  assert.equal(runner.executionTimeoutMs, 10_000);
  const statuses = [];
  const promise = runner.run('print(input())', 'hello', undefined, (status) => statuses.push(status));
  assert.ok(promise instanceof Promise);
  assert.equal(workers.length, 1);
  const worker = workers[0];
  assert.deepEqual(worker.messages, [{ type: 'init' }]);
  assert.deepEqual(statuses, ['loading']);
  worker.emit({ type: 'ready' });
  assert.deepEqual(statuses, ['loading', 'running']);
  assert.deepEqual(worker.runMessage, { type: 'run', id: 1, code: 'print(input())', input: 'hello' });
  worker.done();
  assert.equal(await promise, undefined);
  assert.equal(worker.terminated, false);
});

test('streams stdout chunks in order', async (t) => {
  const { runner, workers } = setup(t);
  const output = [];
  const promise = runner.run('print("hello")', '', (text) => output.push(text));
  const worker = workers[0];
  worker.emit({ type: 'ready' });
  worker.emit({ type: 'output', id: worker.runMessage.id, text: 'hello' });
  worker.emit({ type: 'output', id: worker.runMessage.id, text: '\n' });
  assert.deepEqual(output, ['hello', '\n']);
  worker.done();
  await promise;
});

test('reuses the initialized worker and assigns a fresh execution id', async (t) => {
  const { runner, workers } = setup(t);
  const first = runner.run('pass', '');
  const worker = workers[0];
  worker.emit({ type: 'ready' });
  const firstId = worker.runMessage.id;
  worker.done();
  await first;
  const statuses = [];
  const second = runner.run('print(2)', 'second', undefined, (status) => statuses.push(status));
  assert.equal(workers.length, 1);
  assert.deepEqual(statuses, ['running']);
  assert.notEqual(worker.runMessage.id, firstId);
  assert.deepEqual(worker.messages.map((message) => message.type), ['init', 'run', 'run']);
  worker.done();
  await second;
});

test('rejects Python errors while keeping the runtime reusable', async (t) => {
  const { runner, workers } = setup(t);
  const promise = runner.run('1 / 0', '');
  const rejection = assert.rejects(promise, /ZeroDivisionError: division by zero/);
  const worker = workers[0];
  worker.emit({ type: 'ready' });
  worker.emit({ type: 'error', id: worker.runMessage.id, message: 'ZeroDivisionError: division by zero' });
  await rejection;
  assert.equal(worker.terminated, false);
  const retry = runner.run('pass', '');
  assert.equal(workers.length, 1);
  worker.done();
  await retry;
});

test('rejects initialization errors, cleans up, and retries with a new worker', async (t) => {
  const { runner, workers } = setup(t);
  const promise = runner.run('pass', '');
  const rejection = assert.rejects(promise, /Unable to download Python/);
  workers[0].emit({ type: 'error', id: null, message: 'Unable to download Python' });
  await rejection;
  assertCleaned(workers[0]);
  await retrySuccessfully(runner, workers);
});

for (const phase of ['loading', 'running']) {
  test(`rejects concurrent executions during ${phase} without disturbing the active run`, async (t) => {
    const { runner, workers } = setup(t);
    const promise = runner.run('pass', '');
    const worker = workers[0];
    if (phase === 'running') worker.emit({ type: 'ready' });
    await assert.rejects(runner.run('other', ''), /already loading or running.*Stop/);
    assert.equal(workers.length, 1);
    if (phase === 'loading') worker.emit({ type: 'ready' });
    assert.equal(worker.runMessage.code, 'pass');
    worker.done();
    await promise;
  });

  test(`${phase} timeout terminates the worker and permits retry`, async (t) => {
    const { runner, workers } = setup(t, {
      initTimeoutMs: phase === 'loading' ? 15 : 1_000,
      executionTimeoutMs: phase === 'running' ? 15 : 1_000,
    });
    const promise = runner.run('while True: pass', '');
    const rejection = assert.rejects(promise, phase === 'loading'
      ? /initialization timed out.*run again/
      : /execution timed out.*infinite loop.*run again/);
    if (phase === 'running') workers[0].emit({ type: 'ready' });
    await rejection;
    assertCleaned(workers[0]);
    await retrySuccessfully(runner, workers);
  });

  for (const method of ['stop', 'dispose']) {
    test(`${method} during ${phase} rejects the active run and cleans up`, async (t) => {
      const { runner, workers } = setup(t);
      const promise = runner.run('pass', '');
      const rejection = assert.rejects(promise, /stopped.*Run again.*restart/);
      if (phase === 'running') workers[0].emit({ type: 'ready' });
      runner[method]();
      await rejection;
      assertCleaned(workers[0]);
      runner[method]();
      await retrySuccessfully(runner, workers);
    });
  }

  for (const event of ['error', 'messageerror']) {
    test(`worker ${event} during ${phase} rejects, cleans up, and permits retry`, async (t) => {
      const { runner, workers } = setup(t);
      const promise = runner.run('pass', '');
      const rejection = assert.rejects(promise, event === 'error'
        ? /worker failed: worker crashed.*Run again/
        : /Could not read.*Run again/);
      const worker = workers[0];
      if (phase === 'running') worker.emit({ type: 'ready' });
      if (event === 'error') {
        let prevented = false;
        worker.onerror({ message: 'worker crashed', preventDefault() { prevented = true; } });
        assert.equal(prevented, true);
      } else {
        worker.onmessageerror({});
      }
      await rejection;
      assertCleaned(worker);
      await retrySuccessfully(runner, workers);
    });
  }
}

test('ignores stale output, completion, and errors without settling the current run', async (t) => {
  const { runner, workers } = setup(t);
  const output = [];
  const first = runner.run('pass', '', (text) => output.push(text));
  const worker = workers[0];
  worker.emit({ type: 'output', id: 1, text: 'before ready' });
  worker.emit({ type: 'error', id: 1, message: 'not an init error' });
  worker.emit({ type: 'ready' });
  const oldId = worker.runMessage.id;
  worker.done();
  await first;
  worker.emit({ type: 'output', id: oldId, text: 'while idle' });
  let settled = false;
  const second = runner.run('pass', '', (text) => output.push(text));
  second.then(() => { settled = true; }, () => { settled = true; });
  worker.emit({ type: 'output', id: oldId, text: 'stale' });
  worker.emit({ type: 'done', id: oldId });
  worker.emit({ type: 'error', id: oldId, message: 'stale error' });
  worker.emit({ type: 'error', id: null, message: 'late init error' });
  worker.emit({ type: 'ready' });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(worker.messages.filter((message) => message.type === 'run').length, 2);
  assert.deepEqual(output, []);
  worker.emit({ type: 'output', id: worker.runMessage.id, text: 'current' });
  worker.done();
  await second;
  assert.deepEqual(output, ['current']);
});

test('ignores queued messages and errors from a terminated worker after retry', async (t) => {
  const { runner, workers } = setup(t);
  const first = runner.run('pass', '');
  const rejection = assert.rejects(first, /stopped/);
  const oldMessage = workers[0].onmessage;
  const oldError = workers[0].onerror;
  const oldMessageError = workers[0].onmessageerror;
  runner.stop();
  await rejection;
  const output = [];
  const retry = runner.run('pass', '', (text) => output.push(text));
  oldMessage({ data: { type: 'ready' } });
  oldMessage({ data: { type: 'error', id: null, message: 'old init failure' } });
  oldError({ message: 'old crash' });
  oldMessageError({});
  const worker = workers[1];
  assert.deepEqual(worker.messages, [{ type: 'init' }]);
  worker.emit({ type: 'ready' });
  oldMessage({ data: { type: 'output', id: worker.runMessage.id, text: 'old worker' } });
  assert.deepEqual(output, []);
  worker.done();
  await retry;
});

for (const method of ['stop', 'dispose']) {
  test(`${method} is safe before initialization and terminates an idle runtime`, async (t) => {
    const { runner, workers } = setup(t);
    runner[method]();
    assert.equal(workers.length, 0);
    const promise = runner.run('pass', '');
    workers[0].emit({ type: 'ready' });
    workers[0].done();
    await promise;
    runner[method]();
    assertCleaned(workers[0]);
    await retrySuccessfully(runner, workers);
  });
}

test('an idle worker crash clears the cached runtime', async (t) => {
  const { runner, workers } = setup(t);
  const promise = runner.run('pass', '');
  workers[0].emit({ type: 'ready' });
  workers[0].done();
  await promise;
  workers[0].onerror({ message: 'idle crash' });
  assertCleaned(workers[0]);
  await retrySuccessfully(runner, workers);
});

test('worker factory failures reject and allow retry', async (t) => {
  const workers = [];
  let attempts = 0;
  const runner = new PythonRunner(() => {
    if (attempts++ === 0) throw new Error('Worker creation failed');
    const worker = new MockWorker();
    workers.push(worker);
    return worker;
  });
  t.after(() => runner.dispose());
  await assert.rejects(runner.run('pass', ''), /Worker creation failed/);
  await retrySuccessfully(runner, workers);
});

for (const phase of ['loading', 'running']) {
  test(`postMessage failures during ${phase} reject and clean up`, async (t) => {
    const worker = new MockWorker();
    const runner = new PythonRunner(() => worker);
    t.after(() => runner.dispose());
    if (phase === 'loading') worker.postMessage = () => { throw new Error('Cannot post'); };
    const promise = runner.run('pass', '');
    const rejection = assert.rejects(promise, /Cannot post/);
    if (phase === 'running') {
      worker.postMessage = () => { throw new Error('Cannot post'); };
      worker.emit({ type: 'ready' });
    }
    await rejection;
    assertCleaned(worker);
  });
}

test('clears initialization and execution timers after completion', async (t) => {
  const { runner, workers } = setup(t, { initTimeoutMs: 15, executionTimeoutMs: 15 });
  const promise = runner.run('pass', '');
  workers[0].emit({ type: 'ready' });
  workers[0].done();
  await promise;
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(workers[0].terminated, false);
  const retry = runner.run('pass', '');
  assert.equal(workers.length, 1);
  workers[0].done();
  await retry;
});
