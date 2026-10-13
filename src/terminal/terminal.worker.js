import { createTerminalEngine } from './engine.js';

let engine;
let busy = false;

self.onmessage = async ({ data }) => {
  if (!data || (data.type !== 'init' && data.type !== 'run')) return;
  const id = data.type === 'init' ? null : data.id;
  try {
    if (data.type === 'init') {
      if (!engine) engine = createTerminalEngine();
      self.postMessage({ type: 'ready' });
      return;
    }
    if (!engine) throw new Error('Terminal has not been initialized.');
    if (busy) throw new Error('Terminal is already running.');
    busy = true;
    try {
      const result = await engine.run(data.command);
      self.postMessage({ type: 'done', id, result });
    } finally {
      busy = false;
    }
  } catch (error) {
    self.postMessage({ type: 'error', id, message: String(error?.message || error).slice(0, 2_000) });
  }
};
