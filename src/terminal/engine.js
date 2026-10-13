import { Bash, defineCommand } from "just-bash/browser";
import {
  COMMAND_LIMIT_BYTES,
  EXECUTION_LIMITS,
  HOME,
  OUTPUT_LIMIT_BYTES,
} from "./limits.js";

export const HELP_TEXT = `Pierplace learning terminal — a virtual Bash shell, not your computer's shell.

Explore: pwd, ls, tree, cd, cat, head, tail, find
Create: mkdir, touch, echo, printf, cp, mv, rm
Process text: grep, sed, awk, sort, uniq, cut, tr, wc, tee
Shell: pipes (|), redirects (> and >>), variables, export, unset, loops
Other: env, printenv, seq, date, which, help, clear

Try:
  cat ~/welcome.txt
  ls ~/examples
  grep shell ~/examples/words.txt | wc -l
  bash ~/examples/hello.sh

Files, cwd and variables persist between commands in this runner's worker session.
They are ephemeral: Stop, a hard timeout, a worker failure, disposal, or a page reload
loses the entire session. The next run after Stop/failure starts fresh in /home/learner.
Nothing is saved to your device. Network commands and optional JS/Python are disabled.
Limits: 5 seconds including startup; 32,000 output bytes; 32,000 command bytes;
2,000 shell commands/loop iterations; 4 MB virtual filesystem.
Output limit errors may omit the offending command's output. Other engine limits apply.
This is a command runner, not a TTY: no interactive editor or input prompt.
Only cwd, scalar variables and files carry across runs; functions, aliases, arrays
and shell options should be defined and used within the same command.
`;

export const SEED_FILES = Object.freeze({
  [`${HOME}/welcome.txt`]: `Welcome to your learning terminal!\nStart with pwd, ls, and cat examples/words.txt.\nRun help for commands, limits and ephemeral session boundaries.\n`,
  [`${HOME}/examples/words.txt`]:
    "hello world\nlearn the shell\npipes connect commands\npractice the shell\n",
  [`${HOME}/examples/hello.sh`]:
    '#!/bin/bash\nname="${1:-learner}"\nprintf "Hello, %s!\\n" "$name"\n',
  [`${HOME}/examples/scores.csv`]: "name,score\nAda,95\nGrace,88\nLinus,91\n",
  [`${HOME}/examples/notes.txt`]:
    'Try creating a directory with mkdir practice.\nWrite a file with echo "I learned a command" > practice/today.txt.\nRead it with cat practice/today.txt.\n',
});

const encoder = new TextEncoder();
function bytePrefix(text, limit) {
  const bytes = encoder.encode(text);
  if (bytes.length <= limit) return text;
  // Streaming decode drops an incomplete final UTF-8 character, rather than adding U+FFFD.
  return new TextDecoder().decode(bytes.subarray(0, limit), { stream: true });
}

export function validateCommand(command) {
  if (typeof command !== "string")
    throw new TypeError("Terminal command must be a string.");
  if (encoder.encode(command).length > COMMAND_LIMIT_BYTES) {
    throw new RangeError(
      `Terminal command exceeds ${COMMAND_LIMIT_BYTES.toLocaleString("en-US")} bytes.`,
    );
  }
}

export function boundResult(result, cwd) {
  const rawStdout =
    result.stdoutKind === "bytes" || result.stdoutEncoding === "binary"
      ? new TextDecoder().decode(
          Uint8Array.from(result.stdout, (char) => char.charCodeAt(0)),
        )
      : result.stdout;
  // Keep diagnostics first; stdout receives the remainder of the shared byte budget.
  const stderr = bytePrefix(result.stderr, OUTPUT_LIMIT_BYTES);
  const stdout = bytePrefix(
    rawStdout,
    OUTPUT_LIMIT_BYTES - encoder.encode(stderr).length,
  );
  return {
    stdout,
    stderr,
    exitCode: result.exitCode,
    cwd,
    truncated:
      stdout !== rawStdout ||
      stderr !== result.stderr ||
      /output size limit exceeded/i.test(result.stderr),
  };
}

export function createTerminalEngine() {
  const bash = new Bash({
    cwd: HOME,
    env: {
      HOME,
      USER: "learner",
      LOGNAME: "learner",
      TERM: "dumb",
      LANG: "C.UTF-8",
    },
    files: { ...SEED_FILES },
    executionLimitProfile: "hardened",
    executionLimits: { ...EXECUTION_LIMITS },
    python: false,
    javascript: false,
    // Explicitly exclude browser-incompatible compression commands and non-learning tools.
    commands: [
      "echo",
      "printf",
      "cat",
      "ls",
      "mkdir",
      "rmdir",
      "touch",
      "rm",
      "cp",
      "mv",
      "ln",
      "chmod",
      "pwd",
      "readlink",
      "head",
      "tail",
      "wc",
      "stat",
      "grep",
      "fgrep",
      "egrep",
      "sed",
      "awk",
      "sort",
      "uniq",
      "cut",
      "paste",
      "tr",
      "rev",
      "nl",
      "tee",
      "find",
      "basename",
      "dirname",
      "tree",
      "du",
      "env",
      "printenv",
      "xargs",
      "true",
      "false",
      "clear",
      "bash",
      "sh",
      "jq",
      "base64",
      "diff",
      "date",
      "sleep",
      "timeout",
      "time",
      "seq",
      "expr",
      "which",
      "tac",
      "whoami",
      "hostname",
      "help",
    ],
    customCommands: [
      defineCommand("pierplace-help", async () => ({
        stdout: HELP_TEXT,
        stderr: "",
        exitCode: 0,
      })),
    ],
  });
  let cwd = HOME;
  let env = bash.getEnv();
  let busy = false;

  return {
    async run(command) {
      validateCommand(command);
      if (busy) throw new Error("Terminal is already running.");
      busy = true;
      try {
        // exec() clones shell state, but shares fs. Its result.env is the state handoff.
        // Shell builtins take precedence over custom commands in just-bash 3.4.2.
        const script = command.trim()
          ? `help() { pierplace-help "$@"; }\n${command}`
          : command;
        const result = await bash.exec(script, {
          cwd,
          env,
          replaceEnv: true,
          rawScript: true,
        });
        env = { ...result.env };
        cwd = env.PWD || cwd;
        return boundResult(result, cwd);
      } finally {
        busy = false;
      }
    },
  };
}
