import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.VITE_API_BASE || 'https://pierplace.onrender.com';

const proxy = {
  '/api': {
    target: backend,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
  '/ws': { target: backend.replace(/^http/, 'ws'), ws: true, secure: true },
};

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  server: { proxy },
  preview: { proxy },
});
