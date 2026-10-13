import test from "node:test";
import assert from "node:assert/strict";
import { Bash } from "just-bash/browser";
import {
  boundResult,
  createTerminalEngine,
  HELP_TEXT,
} from "../src/terminal/engine.js";
import {
  COMMAND_LIMIT_BYTES,
  EXECUTION_LIMITS,
  HOME,
  OUTPUT_LIMIT_BYTES,
} from "../src/terminal/limits.js";

const bytes = (text) => new TextEncoder().encode(text).length;

test("3.4.2 browser exec clones cwd/env: engine explicitly hands off state", async () => {
  const bash = new Bash({ cwd: HOME, env: { HOME } });
  const raw = await bash.exec(
    "mkdir practice; cd practice; export LESSON=pipes",
  );
  assert.equal(raw.env.PWD, `${HOME}/practice`);
  assert.equal(raw.env.LESSON, "pipes");
  assert.equal(bash.getCwd(), HOME);
  assert.equal(bash.getEnv().LESSON, undefined);

  const engine = createTerminalEngine();
  const first = await engine.run(
    "mkdir practice; cd practice; export LESSON=pipes; LOCAL=hello; echo saved > note.txt",
  );
  assert.equal(first.cwd, `${HOME}/practice`);
  const next = await engine.run(
    'pwd; printf "%s %s\\n" "$LESSON" "$LOCAL"; cat note.txt',
  );
  assert.equal(next.stdout, `${HOME}/practice\npipes hello\nsaved\n`);
  assert.equal(next.exitCode, 0);
  await engine.run("unset LESSON; rm note.txt; cd ..");
  const last = await engine.run(
    'echo "${LESSON-unset}"; test ! -f practice/note.txt',
  );
  assert.equal(last.stdout, "unset\n");
  assert.equal(last.exitCode, 0);
  assert.equal(last.cwd, HOME);
});

test("seeds a useful home, learning files and an accurate help command", async () => {
  const engine = createTerminalEngine();
  assert.match((await engine.run("cat ~/welcome.txt")).stdout, /Welcome/);
  assert.equal(
    (await engine.run("bash ~/examples/hello.sh Ada")).stdout,
    "Hello, Ada!\n",
  );
  assert.equal(
    (await engine.run("grep shell examples/words.txt | wc -l")).stdout.trim(),
    "2",
  );
  assert.match((await engine.run("cat examples/scores.csv")).stdout, /Ada,95/);
  assert.equal((await engine.run("help")).stdout, HELP_TEXT);
  assert.match((await engine.run("help | grep ephemeral")).stdout, /ephemeral/);
  assert.match(HELP_TEXT, /ephemeral/);
  assert.match(HELP_TEXT, /Stop.*timeout/);
  assert.match(HELP_TEXT, /32,000 output bytes/);
});

test("preserves raw heredocs, Unicode, stdout/stderr separation and nonzero status", async () => {
  const engine = createTerminalEngine();
  await engine.run("cat > unicode.txt <<'EOF'\n  Hello 🌍\nEOF");
  const result = await engine.run("cat unicode.txt; printf warning >&2; false");
  assert.equal(result.stdout, "  Hello 🌍\n");
  assert.equal(result.stderr, "warning");
  assert.equal(result.exitCode, 1);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    Object.keys(result).sort(),
    ["stdout", "stderr", "exitCode", "cwd", "truncated"].sort(),
  );
});

test("ordinary command and syntax failures resolve and do not discard files or variables", async () => {
  const engine = createTerminalEngine();
  await engine.run(
    "mkdir practice; cd practice; export KEEP=yes; echo saved > note",
  );
  const failure = await engine.run("missing-command");
  assert.equal(failure.exitCode, 127);
  assert.match(failure.stderr, /command not found/);
  assert.equal((await engine.run("if")).exitCode, 2);
  assert.equal(
    (await engine.run('echo "$KEEP"; cat note')).stdout,
    "yes\nsaved\n",
  );
  const changed = await engine.run("cd ..; export KEEP=changed; false");
  assert.equal(changed.exitCode, 1);
  assert.equal(changed.cwd, HOME);
  assert.equal((await engine.run('echo "$KEEP"')).stdout, "changed\n");
});

test("empty commands retain session state and cd - retains OLDPWD", async () => {
  const engine = createTerminalEngine();
  await engine.run("cd examples; VALUE=kept");
  const empty = await engine.run(" \n ");
  assert.equal(empty.cwd, `${HOME}/examples`);
  assert.equal(empty.stdout, "");
  assert.equal(empty.exitCode, 0);
  assert.equal(
    (await engine.run('cd -; echo "$VALUE"')).stdout,
    `${HOME}\nkept\n`,
  );
});

test("sessions are isolated and a fresh engine restores seed files", async () => {
  const first = createTerminalEngine();
  const second = createTerminalEngine();
  await first.run("rm welcome.txt; export UNIQUE=yes; touch private.txt");
  assert.equal(
    (await second.run('echo "${UNIQUE-unset}"; test ! -f private.txt')).stdout,
    "unset\n",
  );
  assert.equal((await second.run("cat welcome.txt")).exitCode, 0);
});

test("network and optional JavaScript/Python commands are unavailable, including nested shells", async () => {
  const engine = createTerminalEngine();
  for (const command of [
    "curl https://example.com",
    "wget https://example.com",
    "python3 -c pass",
    "python -c pass",
    "js-exec -e 1",
    'bash -c "curl https://example.com"',
  ]) {
    const result = await engine.run(command);
    assert.equal(result.exitCode, 127, command);
    assert.match(
      result.stderr,
      /command not found|command not available in browser/,
      command,
    );
  }
});

test("rejects invalid and oversized UTF-8 source before execution, remains reusable", async () => {
  const engine = createTerminalEngine();
  await assert.rejects(engine.run(null), TypeError);
  await assert.rejects(
    engine.run("🌍".repeat(COMMAND_LIMIT_BYTES / 4 + 1)),
    RangeError,
  );
  assert.equal((await engine.run("echo ok")).stdout, "ok\n");
});

test("engine output budget stops excessive output and the next command can run", async () => {
  const engine = createTerminalEngine();
  const result = await engine.run("seq 1000000000000000 1000000000001999");
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /output size limit exceeded/);
  assert.equal(result.truncated, true);
  assert.ok(bytes(result.stdout) + bytes(result.stderr) <= OUTPUT_LIMIT_BYTES);
  assert.equal((await engine.run("echo ok")).stdout, "ok\n");
});

test("result cap shares stdout/stderr budget and does not split Unicode characters", () => {
  const result = boundResult(
    { stdout: "🌍".repeat(10000), stderr: "diagnostic\n", exitCode: 0 },
    HOME,
  );
  assert.equal(result.stderr, "diagnostic\n");
  assert.equal(result.truncated, true);
  assert.ok(bytes(result.stdout) + bytes(result.stderr) <= OUTPUT_LIMIT_BYTES);
  assert.doesNotMatch(result.stdout, /\uFFFD/);
  const stderrOnly = boundResult(
    { stdout: "hello", stderr: "x".repeat(40000), exitCode: 1 },
    HOME,
  );
  assert.equal(stderrOnly.stderr.length, OUTPUT_LIMIT_BYTES);
  assert.equal(stderrOnly.stdout, "");
  assert.equal(stderrOnly.truncated, true);
  const binary = boundResult(
    {
      stdout: String.fromCharCode(...new TextEncoder().encode("Hello 🌍")),
      stdoutKind: "bytes",
      stderr: "",
      exitCode: 0,
    },
    HOME,
  );
  assert.equal(binary.stdout, "Hello 🌍");
});

test("engine loop limits bound nonterminating scripts without poisoning the next run", async () => {
  const engine = createTerminalEngine();
  const result = await engine.run("while true; do :; done");
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /limit exceeded|too many commands executed/);
  assert.equal((await engine.run("pwd")).stdout, `${HOME}\n`);
  assert.equal(EXECUTION_LIMITS.maxFileSystemBytes, 4_000_000);
});

test("direct engine callers cannot overlap commands", async () => {
  const engine = createTerminalEngine();
  const active = engine.run("echo first");
  await assert.rejects(engine.run("echo second"), /already running/);
  assert.equal((await active).stdout, "first\n");
});
