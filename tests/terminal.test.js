import test from "node:test";
import assert from "node:assert/strict";
import {
  createTerminalRunner,
  TerminalRunner,
} from "../src/terminal/runner.js";
import { HARD_TIMEOUT_MS, HOME } from "../src/terminal/limits.js";

const result = {
  stdout: "hello\n",
  stderr: "",
  exitCode: 0,
  cwd: HOME,
  truncated: false,
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class MockWorker {
  constructor() {
    this.messages = [];
    this.terminated = false;
  }
  postMessage(message) {
    this.messages.push(message);
  }
  emit(data) {
    this.onmessage?.({ data });
  }
  terminate() {
    this.terminated = true;
  }
  done(value = result) {
    this.emit({ type: "done", id: this.messages.at(-1).id, result: value });
  }
}
function setup(t, options) {
  const workers = [];
  const runner = new TerminalRunner(() => {
    const worker = new MockWorker();
    workers.push(worker);
    return worker;
  }, options);
  t.after(() => runner.dispose());
  return { runner, workers };
}
function cleaned(worker) {
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
  assert.equal(worker.onerror, null);
  assert.equal(worker.onmessageerror, null);
}
async function retry(runner, workers) {
  const promise = runner.run("echo hello");
  const worker = workers.at(-1);
  worker.emit({ type: "ready" });
  worker.done();
  return promise;
}

test("factory is lazy, creates a module worker and returns the exact UI result contract", async (t) => {
  const original = globalThis.Worker;
  const workers = [];
  globalThis.Worker = class extends MockWorker {
    constructor(url, options) {
      super();
      workers.push(this);
      assert.match(url.href, /terminal\/terminal.browser.worker.js$/);
      assert.deepEqual(options, { type: "module" });
    }
  };
  t.after(() => {
    if (original === undefined) delete globalThis.Worker;
    else globalThis.Worker = original;
  });
  const runner = createTerminalRunner();
  t.after(() => runner.dispose());
  assert.equal(workers.length, 0);
  assert.equal(runner.timeoutMs, HARD_TIMEOUT_MS);
  const first = runner.run("echo hello");
  assert.deepEqual(workers[0].messages, [{ type: "init" }]);
  workers[0].emit({ type: "ready" });
  assert.deepEqual(workers[0].messages[1], {
    type: "run",
    id: 1,
    command: "echo hello",
  });
  workers[0].done();
  assert.deepEqual(await first, { ...result, sessionId: 1 });
  const second = runner.run("false");
  workers[0].done({ ...result, stdout: "", exitCode: 1 });
  assert.equal((await second).exitCode, 1);
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages.at(-1).id, 2);
});

for (const phase of ["loading", "running"]) {
  test(`concurrent run during ${phase} rejects without disturbing the active run`, async (t) => {
    const { runner, workers } = setup(t);
    const first = runner.run("echo hello");
    if (phase === "running") workers[0].emit({ type: "ready" });
    await assert.rejects(runner.run("other"), { code: "BUSY" });
    if (phase === "loading") workers[0].emit({ type: "ready" });
    workers[0].done();
    assert.equal((await first).sessionId, 1);
  });

  test(`${phase} hard timeout terminates, cleans up and restarts lazily`, async (t) => {
    const { runner, workers } = setup(t, { timeoutMs: 25 });
    const first = runner.run("sleep 10");
    const rejection = assert.rejects(first, { code: "TIMEOUT" });
    if (phase === "running") workers[0].emit({ type: "ready" });
    await rejection;
    cleaned(workers[0]);
    assert.equal(workers.length, 1);
    assert.equal((await retry(runner, workers)).sessionId, 2);
  });

  test(`Stop during ${phase} rejects with CANCELLED and allows a new session`, async (t) => {
    const { runner, workers } = setup(t);
    const first = runner.run("echo hello");
    const rejection = assert.rejects(first, { code: "CANCELLED" });
    if (phase === "running") workers[0].emit({ type: "ready" });
    runner.stop();
    await rejection;
    cleaned(workers[0]);
    runner.stop();
    assert.equal((await retry(runner, workers)).sessionId, 2);
  });

  test(`dispose during ${phase} settles and permanently closes the runner`, async (t) => {
    const { runner, workers } = setup(t);
    const first = runner.run("echo hello");
    const rejection = assert.rejects(first, { code: "DISPOSED" });
    if (phase === "running") workers[0].emit({ type: "ready" });
    runner.dispose();
    await rejection;
    cleaned(workers[0]);
    runner.dispose();
    runner.stop();
    await assert.rejects(runner.run("echo retry"), { code: "DISPOSED" });
    assert.equal(workers.length, 1);
  });

  for (const event of ["error", "messageerror"]) {
    test(`worker ${event} during ${phase} resets and permits retry`, async (t) => {
      const { runner, workers } = setup(t);
      const first = runner.run("echo hello");
      const rejection = assert.rejects(first, { code: "WORKER_ERROR" });
      if (phase === "running") workers[0].emit({ type: "ready" });
      if (event === "error") {
        let prevented = false;
        workers[0].onerror({
          message: "crash",
          preventDefault() {
            prevented = true;
          },
        });
        assert.equal(prevented, true);
      } else workers[0].onmessageerror({});
      await rejection;
      cleaned(workers[0]);
      await retry(runner, workers);
    });
  }

  test(`worker protocol error during ${phase} resets and permits retry`, async (t) => {
    const { runner, workers } = setup(t);
    const first = runner.run("echo hello");
    const rejection = assert.rejects(first, { code: "WORKER_ERROR" });
    if (phase === "running") workers[0].emit({ type: "ready" });
    workers[0].emit({
      type: "error",
      id: phase === "loading" ? null : 1,
      message: "engine failed",
    });
    await rejection;
    cleaned(workers[0]);
    await retry(runner, workers);
  });
}

test("startup and execution use the same timer, not two fresh deadlines", async (t) => {
  const { runner, workers } = setup(t, { timeoutMs: 200 });
  const first = runner.run("sleep 10");
  const rejection = assert.rejects(first, { code: "TIMEOUT" });
  const timer = runner.active.timer;
  await delay(20);
  workers[0].emit({ type: "ready" });
  assert.equal(runner.active.timer, timer);
  await rejection;
  cleaned(workers[0]);
});

test("ignores wrong IDs, duplicate ready and queued messages from terminated workers", async (t) => {
  const { runner, workers } = setup(t);
  const first = runner.run("echo hello");
  const rejection = assert.rejects(first, { code: "CANCELLED" });
  const oldMessage = workers[0].onmessage;
  const oldError = workers[0].onerror;
  const oldMessageError = workers[0].onmessageerror;
  runner.stop();
  await rejection;
  const second = runner.run("echo current");
  let settled = false;
  second.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  oldMessage({ data: { type: "ready" } });
  oldError({ message: "old crash" });
  oldMessageError({});
  assert.deepEqual(workers[1].messages, [{ type: "init" }]);
  workers[1].emit({ type: "ready" });
  workers[1].emit({ type: "ready" });
  workers[1].emit({ type: "done", id: 1, result });
  workers[1].emit({ type: "error", id: null, message: "stale" });
  oldMessage({ data: { type: "done", id: 2, result } });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(workers[1].messages.length, 2);
  workers[1].done();
  assert.equal((await second).sessionId, 2);
});

test("invalid command rejects before worker creation and defaults cannot exceed 5 seconds", async (t) => {
  const { runner, workers } = setup(t);
  for (const command of [null, {}, "x".repeat(32001), "🌍".repeat(8001)]) {
    await assert.rejects(runner.run(command), { code: "INVALID_COMMAND" });
  }
  assert.equal(workers.length, 0);
  for (const timeoutMs of [0, -1, NaN, Infinity, 5001]) {
    assert.throws(
      () => new TerminalRunner(() => new MockWorker(), { timeoutMs }),
      RangeError,
    );
  }
  await retry(runner, workers);
});

test("Stop before initialization is safe; idle Stop resets; idle crash resets", async (t) => {
  const { runner, workers } = setup(t);
  runner.stop();
  assert.equal(workers.length, 0);
  await retry(runner, workers);
  runner.stop();
  cleaned(workers[0]);
  await retry(runner, workers);
  workers[1].onerror({ message: "idle crash" });
  cleaned(workers[1]);
  assert.equal((await retry(runner, workers)).sessionId, 3);
});

test("factory and postMessage failures always settle and clear the worker", async (t) => {
  let shouldThrow = true;
  const worker = new MockWorker();
  const runner = new TerminalRunner(() => {
    if (shouldThrow) throw new Error("factory failed");
    return worker;
  });
  t.after(() => runner.dispose());
  await assert.rejects(runner.run("echo hi"), { code: "WORKER_ERROR" });
  shouldThrow = false;
  worker.postMessage = () => {
    throw new Error("cannot post");
  };
  await assert.rejects(runner.run("echo hi"), { code: "WORKER_ERROR" });
  cleaned(worker);
  const running = setup(t);
  const active = running.runner.run("echo hi");
  const rejection = assert.rejects(active, { code: "WORKER_ERROR" });
  running.workers[0].postMessage = () => {
    throw new Error("cannot run");
  };
  running.workers[0].emit({ type: "ready" });
  await rejection;
  cleaned(running.workers[0]);
});

test("cooperative engine deadline also terminates and resets, but ordinary exit 124 resolves", async (t) => {
  const { runner, workers } = setup(t);
  const first = runner.run("sleep 10");
  const rejection = assert.rejects(first, { code: "TIMEOUT" });
  workers[0].emit({ type: "ready" });
  workers[0].done({
    ...result,
    exitCode: 124,
    stderr: "bash: sleep exceeded its execution deadline\n",
  });
  await rejection;
  cleaned(workers[0]);
  await retry(runner, workers);
  const ordinary = runner.run("exit 124");
  workers[1].done({ ...result, exitCode: 124 });
  assert.equal((await ordinary).exitCode, 124);
});

test("malformed completion resets rather than leaking a pending promise", async (t) => {
  const { runner, workers } = setup(t);
  const first = runner.run("echo hi");
  const rejection = assert.rejects(first, { code: "WORKER_ERROR" });
  workers[0].emit({ type: "ready" });
  workers[0].done({ stdout: "incomplete" });
  await rejection;
  cleaned(workers[0]);
});

test("termination errors cannot prevent cancellation from settling", async (t) => {
  const { runner, workers } = setup(t);
  const first = runner.run("echo hi");
  const rejection = assert.rejects(first, { code: "CANCELLED" });
  workers[0].terminate = () => {
    throw new Error("already dead");
  };
  runner.stop();
  await rejection;
  assert.equal(runner.worker, null);
  await retry(runner, workers);
});

test("successful completion clears the deadline so an idle worker stays reusable", async (t) => {
  const { runner, workers } = setup(t, { timeoutMs: 25 });
  await retry(runner, workers);
  await delay(50);
  assert.equal(workers[0].terminated, false);
  const next = runner.run("echo next");
  workers[0].done();
  await next;
  assert.equal(workers.length, 1);
});
