import { setupWorker } from 'msw/browser';
import { createHandlers, createMockStore } from './handlers.js';
let storage;
try { storage = window.localStorage; } catch { storage = null; }
export const worker = setupWorker(...createHandlers(createMockStore(storage), 220, { chat: false }));
