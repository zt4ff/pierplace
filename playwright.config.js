import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'PIERPLACE_RELOAD=0 .venv/bin/python -m app.seed && PIERPLACE_RELOAD=0 .venv/bin/python -m app',
      cwd: 'backend',
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: true,
      timeout: 60000,
    },
    { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 30000 },
  ],
});
