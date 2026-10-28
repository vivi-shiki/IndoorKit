import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  use: {
    baseURL: `http://localhost:${PORT}/IndoorKit/`,
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'e2e', testDir: 'apps/playground/e2e' },
    { name: 'leak-bench', testDir: 'tools/leak-bench', workers: 1 },
  ],
  webServer: {
    command: 'pnpm --filter playground run preview',
    url: `http://localhost:${PORT}/IndoorKit/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
