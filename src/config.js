// Backend origin used by the browser client. Defaults to the deployed
// service; override with VITE_API_BASE for a local backend.
const DEFAULT_API_BASE = 'http://0.0.0.0:8000/';

const configuredBase = import.meta.env?.VITE_API_BASE ?? DEFAULT_API_BASE;

/** REST base URL (no trailing slash). */
export const API_BASE = configuredBase.replace(/\/+$/, '');

/** Presence/chat WebSocket URL. Derived from the API base unless overridden. */
export const PRESENCE_URL =
  import.meta.env?.VITE_PRESENCE_URL ?? `${API_BASE.replace(/^http/, 'ws')}/ws`;
