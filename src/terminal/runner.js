import { COMMAND_LIMIT_BYTES, HARD_TIMEOUT_MS } from "./limits.js";

function terminalError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * One command at a time, no streaming. Ordinary shell failures resolve with exitCode.
 * Runtime failures reject with Error.code and destroy the ephemeral session.
 * stop() resets (and permits reuse); dispose() resets and permanently closes the runner.
 */
export class TerminalRunner {
  constructor(createWorker, { timeoutMs = HARD_TIMEOUT_MS } = {}) {
    if (typeof createWorker !== "function")
      throw new TypeError("A worker factory is required.");
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > HARD_TIMEOUT_MS
    ) {
      throw new RangeError(
        `timeoutMs must be greater than zero and at most ${HARD_TIMEOUT_MS}.`,
      );
    }
    this.createWorker = createWorker;
    this.timeoutMs = timeoutMs;
    this.worker = null;
    this.ready = false;
    this.active = null;
    this.nextId = 1;
    this.sessionId = 0;
    this.disposed = false;
  }

  run(command) {
    if (this.disposed)
      return Promise.reject(
        terminalError("DISPOSED", "Terminal runner has been disposed."),
      );
    if (this.active)
      return Promise.reject(
        terminalError(
          "BUSY",
          "Terminal is already loading or running. Stop it before running another command.",
        ),
      );
    if (typeof command !== "string")
      return Promise.reject(
        terminalError("INVALID_COMMAND", "Terminal command must be a string."),
      );
    // Avoid allocating an unbounded UTF-8 buffer for an already oversized string.
    if (
      command.length > COMMAND_LIMIT_BYTES ||
      new TextEncoder().encode(command).length > COMMAND_LIMIT_BYTES
    ) {
      return Promise.reject(
        terminalError(
          "INVALID_COMMAND",
          `Terminal command exceeds ${COMMAND_LIMIT_BYTES} bytes.`,
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const task = {
        id: this.nextId++,
        command,
        resolve,
        reject,
        phase: this.ready ? "running" : "loading",
      };
      this.active = task;
      // This timer is never refreshed on ready: startup and execution share one deadline.
      task.timer = setTimeout(
        () =>
          this.fail(
            terminalError(
              "TIMEOUT",
              "Terminal timed out. The session was reset; run again to start fresh.",
            ),
          ),
        this.timeoutMs,
      );
      try {
        if (this.ready) {
          this.startExecution(task);
          return;
        }
        const worker = this.createWorker();
        this.worker = worker;
        this.sessionId++;
        worker.onmessage = ({ data }) => {
          if (this.worker !== worker) return;
          try {
            this.handleMessage(data);
          } catch (error) {
            this.fail(
              terminalError(
                "WORKER_ERROR",
                `Terminal worker protocol failed: ${error.message}`,
              ),
            );
          }
        };
        worker.onerror = (event) => {
          if (this.worker !== worker) return;
          event.preventDefault?.();
          this.fail(
            terminalError(
              "WORKER_ERROR",
              `Terminal worker failed: ${event.message || "Unknown error"}. The session was reset.`,
            ),
          );
        };
        worker.onmessageerror = () => {
          if (this.worker !== worker) return;
          this.fail(
            terminalError(
              "WORKER_ERROR",
              "Could not read a terminal worker message. The session was reset.",
            ),
          );
        };
        worker.postMessage({ type: "init" });
      } catch (error) {
        this.fail(
          terminalError(
            "WORKER_ERROR",
            `Could not start terminal: ${error.message}`,
          ),
        );
      }
    });
  }

  startExecution(task) {
    task.phase = "running";
    this.worker.postMessage({
      type: "run",
      id: task.id,
      command: task.command,
    });
  }

  handleMessage(message) {
    const task = this.active;
    if (!task || !message) return;
    if (task.phase === "loading") {
      if (message.type === "ready") {
        this.ready = true;
        this.startExecution(task);
      } else if (message.type === "error" && message.id === null) {
        this.fail(
          terminalError(
            "WORKER_ERROR",
            `Terminal initialization failed: ${message.message}`,
          ),
        );
      }
      return;
    }
    if (message.id !== task.id) return;
    if (message.type === "done") {
      const result = message.result;
      if (
        !result ||
        typeof result.stdout !== "string" ||
        typeof result.stderr !== "string" ||
        !Number.isInteger(result.exitCode) ||
        typeof result.cwd !== "string" ||
        typeof result.truncated !== "boolean"
      ) {
        throw new Error("Invalid terminal result.");
      }
      // Engine deadlines can win the race against the hard worker deadline.
      if (
        result.exitCode === 124 &&
        /execution deadline|execution time.*(?:limit|exceeded)/i.test(
          result.stderr,
        )
      ) {
        this.fail(
          terminalError(
            "TIMEOUT",
            "Terminal timed out. The session was reset; run again to start fresh.",
          ),
        );
        return;
      }
      clearTimeout(task.timer);
      this.active = null;
      task.resolve({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        cwd: result.cwd,
        truncated: result.truncated,
        sessionId: this.sessionId,
      });
    } else if (message.type === "error") {
      this.fail(
        terminalError(
          "WORKER_ERROR",
          `Terminal execution failed: ${message.message}. The session was reset.`,
        ),
      );
    }
  }

  fail(error) {
    const task = this.active;
    this.active = null;
    if (task) clearTimeout(task.timer);
    this.resetWorker();
    task?.reject(error);
  }

  resetWorker() {
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    try {
      worker.terminate();
    } catch {
      // Cleanup must not keep the active promise from settling.
    }
  }

  stop() {
    this.fail(
      terminalError(
        "CANCELLED",
        "Terminal was stopped. The session was reset; run again to start fresh.",
      ),
    );
  }

  dispose() {
    this.disposed = true;
    this.fail(terminalError("DISPOSED", "Terminal runner has been disposed."));
  }
}

/** Create once per mounted terminal; call dispose() in React effect cleanup. */
export function createTerminalRunner() {
  return new TerminalRunner(
    () =>
      new Worker(new URL("./terminal.browser.worker.js", import.meta.url), {
        type: "module",
      }),
  );
}
