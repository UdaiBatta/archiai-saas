import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests run the real frontend, real backend and a real Postgres
 * database. Only the LLM is replaced (e2e/fake-llm.mjs), so runs are
 * deterministic and cost nothing.
 *
 * Everything lives on its own ports so a local dev stack can keep running:
 *   frontend 5175, backend 8001, fake LLM 4010.
 *
 * Needed in the environment:
 *   E2E_DATABASE_URL  postgresql+asyncpg://... for a database used only by these tests
 *   E2E_PYTHON        python with the backend requirements (default: python)
 *   E2E_CHANNEL       e.g. "chrome" to use an installed browser (default: Playwright's Chromium)
 */
const FRONTEND = 'http://localhost:5175'
const BACKEND = 'http://localhost:8001'
const python = process.env.E2E_PYTHON || 'python'
const databaseUrl = process.env.E2E_DATABASE_URL
if (!databaseUrl) throw new Error('Set E2E_DATABASE_URL to a throwaway database (see frontend/playwright.config.ts).')

export default defineConfig({
  testDir: './e2e',
  // One project, one database, rate-limited auth: run the files one after another.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: FRONTEND,
    channel: process.env.E2E_CHANNEL || undefined,
    storageState: 'e2e/.auth/user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The editor is WebGL: software GL keeps headless runners (CI) working.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: [
    {
      name: 'fake LLM',
      command: 'node e2e/fake-llm.mjs',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      name: 'backend',
      command: `${JSON.stringify(python)} -m alembic upgrade head && ${JSON.stringify(python)} -m uvicorn app.main:app --port 8001`,
      cwd: '../backend',
      url: `${BACKEND}/docs`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        SECRET_KEY: 'e2e-only-secret-key-0123456789abcdef0123456789',
        ALLOWED_ORIGINS: `${FRONTEND},http://127.0.0.1:5175`,
        // Never reach a real provider, whatever backend/.env says.
        LLM_BASE_URL: 'http://127.0.0.1:4010/v1',
        LLM_API_KEY: '',
        LLM_MODEL: '',
        LLM_TIMEOUT_S: '20',
      },
    },
    {
      name: 'frontend',
      command: 'npx vite --port 5175 --strictPort',
      url: FRONTEND,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: BACKEND },
    },
  ],
})
