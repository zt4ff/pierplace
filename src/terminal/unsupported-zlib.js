// just-bash/browser 3.4.2 retains static zlib imports even when these commands
// are disabled. Do not add a compression polyfill or expose host capabilities.
function unsupported() {
  throw new Error('Compression is unavailable in the learning terminal.');
}

export const constants = Object.freeze({});
export const gunzipSync = unsupported;
export const gzipSync = unsupported;
