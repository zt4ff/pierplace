import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
  '/ws': { target: 'ws://localhost:8000', ws: true },
};

export default defineConfig({
  plugins: [react()],
  build: { target: 'es2022' },
  server: { proxy },
  preview: { proxy },
});
