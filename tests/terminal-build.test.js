import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "vite";
import { buildTerminalWorker } from "../src/terminal/build-worker.js";

// No build writes outside src/terminal, and tests themselves never write build output.
test(
  "checked-in browser worker is reproducible and contains no external imports",
  { timeout: 20000 },
  async () => {
    const result = await buildTerminalWorker({ write: false });
    const stored = await readFile(
      new URL("../src/terminal/terminal.browser.worker.js", import.meta.url),
      "utf8",
    );
    assert.equal(
      result.outputFiles[0].text,
      stored,
      "Regenerate with node src/terminal/build-worker.js",
    );
    assert.doesNotMatch(stored, /\bfrom\s*["'](?:node:|https?:|just-bash)/);
  },
);

test(
  "controller and its actual module worker build for browsers without config changes",
  { timeout: 20000 },
  async () => {
    const result = await build({
      root: new URL("../", import.meta.url).pathname,
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: false,
        lib: { entry: "src/terminal/runner.js", formats: ["es"] },
      },
    });
    const output = (Array.isArray(result) ? result : [result]).flatMap(
      (build) => build.output,
    );
    const worker = output.find((file) =>
      /terminal.browser.worker.*\.js$/.test(file.fileName),
    );
    assert.ok(worker, "Vite emitted the bundled browser worker");
    assert.ok(
      output.some(
        (file) =>
          file.type === "chunk" && file.code.includes("createTerminalRunner"),
      ),
    );
  },
);
