import { defineConfig } from '@playwright/test'

// Run at home against `make serve-web` and the backend; docs/e2e-run.md shows the commands.
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: process.env.WEB_URL ?? 'http://127.0.0.1:3000' },
})
