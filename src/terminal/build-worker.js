import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** Rebuild the checked-in worker without touching app configuration or dist. */
export function buildTerminalWorker({ write = true } = {}) {
  return build({
    absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
    entryPoints: ['src/terminal/terminal.worker.js'],
    outfile: 'src/terminal/terminal.browser.worker.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'eof',
    banner: { js: '// Generated from terminal.worker.js using just-bash/browser@3.4.2. Regenerate: node src/terminal/build-worker.js' },
    alias: { 'node:zlib': fileURLToPath(new URL('./unsupported-zlib.js', import.meta.url)) },
    write,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildTerminalWorker();
  console.log('Built src/terminal/terminal.browser.worker.js');
}
