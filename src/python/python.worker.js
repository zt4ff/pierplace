const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const OUTPUT_LIMIT = 64000;
let python;

async function initialize() {
  try {
    importScripts(`${PYODIDE_URL}pyodide.js`);
    python = await self.loadPyodide({ indexURL: PYODIDE_URL });
    self.postMessage({ type: "ready" });
  } catch {
    self.postMessage({
      type: "error",
      id: null,
      message:
        "Could not load Python. The first run needs an internet connection to download the runtime. Check your connection and try again.",
    });
  }
}

async function run({ id, code, input }) {
  let globals;
  let pending = "";
  let captured = 0;
  let truncated = false;
  function flush() {
    if (!pending) return;
    self.postMessage({ type: "output", id, text: pending });
    pending = "";
  }
  const decoder = new TextDecoder();
  function output(buffer) {
    if (truncated) return buffer.length;
    const text = decoder.decode(buffer, { stream: true });
    const remaining = OUTPUT_LIMIT - captured;
    pending += text.slice(0, remaining);
    captured += Math.min(text.length, remaining);
    if (text.length > remaining) {
      pending += "\n[Output truncated at 64,000 characters.]\n";
      truncated = true;
    }
    if (pending.length >= 4096 || truncated) flush();
    return buffer.length;
  }
  try {
    const lines = input ? input.replace(/\r\n/g, "\n").split("\n") : [];
    python.setStdout({ write: output });
    python.setStderr({ write: output });
    python.setStdin({
      stdin: () => (lines.length ? lines.shift() : null),
      isatty: false,
    });
    globals = python.toPy({ __name__: "__main__" });
    try {
      const result = await python.runPythonAsync(code, { globals });
      result?.destroy?.();
    } finally {
      python.runPython("import sys; sys.stdout.flush(); sys.stderr.flush()");
    }
    flush();
    self.postMessage({ type: "done", id });
  } catch (error) {
    flush();
    self.postMessage({
      type: "error",
      id,
      message: String(error).slice(-8000),
    });
  } finally {
    globals?.destroy();
  }
}

self.onmessage = (event) => {
  if (event.data.type === "init") return initialize();
  if (event.data.type === "run") return run(event.data);
};
