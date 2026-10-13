import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { TerminalRunner } from "../src/terminal/runner.js";
import { HOME } from "../src/terminal/limits.js";

// Execute the actual browser worker module, with only its Worker host API adapted to Node.
const workerUrl = new URL(
  "../src/terminal/terminal.browser.worker.js",
  import.meta.url,
).href;
const bootstrap = `
  const { parentPort } = require('node:worker_threads');
  globalThis.self = { postMessage: message => parentPort.postMessage(message) };
  const loaded = import(${JSON.stringify(workerUrl)});
  parentPort.on('message', async data => {
    await loaded;
    await self.onmessage({ data });
  });
`;
class BrowserWorker {
  constructor() {
    this.thread = new Worker(bootstrap, { eval: true });
    this.terminated = false;
    this.thread.on("message", (data) => this.onmessage?.({ data }));
    this.thread.on("error", (error) =>
      this.onerror?.({ message: error.message }),
    );
    this.thread.on("messageerror", () => this.onmessageerror?.({}));
  }
  postMessage(data) {
    this.thread.postMessage(data);
  }
  terminate() {
    this.terminated = true;
    this.termination = this.thread.terminate();
  }
}
function setup(t, options) {
  const workers = [];
  const runner = new TerminalRunner(() => {
    const worker = new BrowserWorker();
    workers.push(worker);
    return worker;
  }, options);
  t.after(async () => {
    runner.dispose();
    await Promise.all(workers.map((worker) => worker.termination));
  });
  return { runner, workers };
}

test(
  "actual worker/controller preserves cwd, env and files and resolves shell errors",
  { timeout: 10000 },
  async (t) => {
    const { runner, workers } = setup(t);
    const first = await runner.run(
      'mkdir practice; cd practice; export TOPIC=pipes; echo "hello 🌍" > note',
    );
    assert.equal(first.cwd, `${HOME}/practice`);
    const second = await runner.run(
      'echo "$TOPIC"; cat note; printf warning >&2; false',
    );
    assert.deepEqual(second, {
      stdout: "pipes\nhello 🌍\n",
      stderr: "warning",
      exitCode: 1,
      cwd: `${HOME}/practice`,
      truncated: false,
      sessionId: 1,
    });
    assert.equal(workers.length, 1);
    assert.equal((await runner.run("missing-command")).exitCode, 127);
    assert.equal((await runner.run("echo still-here")).stdout, "still-here\n");
  },
);

test(
  "actual worker hard timeout terminates and next run creates a fresh seeded session",
  { timeout: 10000 },
  async (t) => {
    const { runner, workers } = setup(t, { timeoutMs: 1500 });
    await runner.run(
      "mkdir practice; cd practice; export LOST=yes; touch note",
    );
    await assert.rejects(runner.run("sleep 10"), { code: "TIMEOUT" });
    assert.equal(workers[0].terminated, true);
    await workers[0].termination;
    const fresh = await runner.run(
      'echo "${LOST-unset}"; test ! -f practice/note; cat welcome.txt',
    );
    assert.equal(fresh.cwd, HOME);
    assert.equal(fresh.sessionId, 2);
    assert.equal(fresh.exitCode, 0);
    assert.match(fresh.stdout, /^unset\nWelcome/);
    assert.equal(workers.length, 2);
  },
);

test(
  "actual worker cancellation kills active execution and recreates the session",
  { timeout: 10000 },
  async (t) => {
    const { runner, workers } = setup(t);
    await runner.run("export LOST=yes; rm welcome.txt");
    const active = runner.run("sleep 10");
    const rejection = assert.rejects(active, { code: "CANCELLED" });
    runner.stop();
    await rejection;
    await workers[0].termination;
    const fresh = await runner.run('echo "${LOST-unset}"; cat welcome.txt');
    assert.equal(fresh.sessionId, 2);
    assert.match(fresh.stdout, /^unset\nWelcome/);
  },
);

test(
  "actual worker returns bounded output and exposes no optional runtime or network capabilities",
  { timeout: 10000 },
  async (t) => {
    const { runner } = setup(t);
    const limited = await runner.run("seq 1000000000000000 1000000000001999");
    assert.equal(limited.truncated, true);
    assert.ok(Buffer.byteLength(limited.stdout + limited.stderr) <= 32000);
    assert.notEqual(limited.exitCode, 0);
    for (const command of [
      "curl https://example.com",
      "python3 -c pass",
      "js-exec -e 1",
    ]) {
      const result = await runner.run(command);
      assert.equal(result.exitCode, 127);
    }
    assert.equal((await runner.run("help")).exitCode, 0);
  },
);
