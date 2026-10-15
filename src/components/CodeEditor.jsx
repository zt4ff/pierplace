import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { PythonRunner } from "../python/runner.js";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

const STORAGE_KEY = "PierPlace.laptop.python.v1";
const LEGACY_KEY = "PierPlace.laptop.code.v1";
const STARTER =
  'print("Hello, Python!")\n';

function readDocument(storageKey, legacyKey) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey) || localStorage.getItem(legacyKey),
    );
    if (saved?.language === "python" && typeof saved.code === "string")
      return { code: saved.code, status: "Saved on this device." };
    return {
      code: STARTER,
      status:
        "Python code autosaves on this device. Older non-Python work is kept separately.",
    };
  } catch {
    return {
      code: STARTER,
      status:
        "Could not load saved code. Copy your work somewhere safe if storage is blocked.",
    };
  }
}

export default function CodeEditor({
  value: controlledValue,
  onChange: onControlledChange,
  persist = true,
  storageKey = STORAGE_KEY,
  legacyKey = LEGACY_KEY,
  title = "main.py · Python",
  ariaLabel = "Python code editor",
  onOutput,
} = {}) {
  const controlled = controlledValue !== undefined;
  const [document, setDocument] = useState(() =>
    controlled
      ? { code: controlledValue, status: "" }
      : readDocument(storageKey, legacyKey),
  );
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const [runner] = useState(
    () =>
      new PythonRunner(
        () =>
          new Worker(new URL("../python/python.worker.js", import.meta.url)),
      ),
  );
  const mounted = useRef(false);
  const outputRef = useRef(null);
  const busy = status === "loading" || status === "running";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      runner.dispose();
    };
  }, [runner]);
  useEffect(() => {
    if (controlled) setDocument((previous) => ({ ...previous, code: controlledValue }));
  }, [controlled, controlledValue]);
  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [output, error]);

  function update(code) {
    if (controlled) {
      setDocument({ code, status: "" });
      onControlledChange?.(code);
      return;
    }
    let nextStatus;
    try {
      if (persist) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ code, language: "python" }),
        );
        nextStatus = "Saved on this device.";
      }
    } catch {
      nextStatus =
        "Not saved: device storage is unavailable or full. Copy your code somewhere safe.";
    }
    setDocument({ code, status: nextStatus });
  }
  async function run() {
    if (busy || !document.code.trim()) return;
    setOutput("");
    setError("");
    setStatus("loading");
    try {
      await runner.run(
        document.code,
        input,
        (text) => {
          if (mounted.current) {
            setOutput((previous) => (previous + text).slice(0, 64100));
            onOutput?.(text);
          }
        },
        (stage) => {
          if (mounted.current) setStatus(stage);
        },
      );
      if (mounted.current) setStatus("complete");
    } catch (error) {
      if (mounted.current) {
        setError(error.message);
        setStatus("error");
      }
    }
  }

  return (
    <div className="code-editor-app">
      <div className="window-bar editor-toolbar">
        <span>{title}</span>
        <div className="editor-run-controls">
          <button
            type="button"
            onClick={run}
            disabled={busy || !document.code.trim()}
          >
            <Play size={14} aria-hidden="true" /> Run Python
          </button>
          {busy && (
            <button type="button" onClick={() => runner.stop()}>
              <Square size={14} aria-hidden="true" /> Stop
            </button>
          )}
        </div>
      </div>
      <div className="monaco-container">
        <Editor
          height="100%"
          language="python"
          value={document.code}
          theme="vs-dark"
          loading={<p role="status">Starting Monaco…</p>}
          onChange={(code) => update(code ?? "")}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: "on",
            ariaLabel,
            accessibilitySupport: "on",
          }}
        />
      </div>
      <section className="python-console" aria-label="Python output">
        <div className="window-bar">
          <span>Output</span>
          <span role="status">
            {status === "loading"
              ? "Downloading / starting Python…"
              : status === "running"
                ? "Running…"
                : status === "complete"
                  ? "Finished"
                  : status === "error"
                    ? "Stopped or failed"
                    : "Ready to run"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setOutput("");
              setError("");
              setStatus("idle");
            }}
          >
            Clear output
          </button>
        </div>
        <div ref={outputRef} className="python-output" tabIndex={0}>
          {output && <pre>{output}</pre>}
          {error && <pre className="python-error">{error}</pre>}
          {!output && !error && (
            <p>
              {busy
                ? "Waiting for output…"
                : status === "complete"
                  ? "Program finished without output. Use print() to display a result."
                  : "Press Run Python to see your print() output here."}
            </p>
          )}
        </div>
      </section>
      <details className="python-input">
        <summary>Program input (optional)</summary>
        <label htmlFor="python-stdin">Values for input(), one per line</label>
        <textarea
          id="python-stdin"
          rows={2}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ada"
          spellCheck={false}
        />
      </details>
      <p className="editor-status" role="status">
        {controlled
          ? "Runs locally; the first run downloads Python. Runs stop after 10 seconds."
          : `${document.status} Runs locally; the first run downloads Python. Runs stop after 10 seconds. Press Ctrl+M to toggle Tab moving focus.`}
      </p>
    </div>
  );
}
