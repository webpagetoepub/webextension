import { defineConfig } from '@playwright/test';

// Extensions load only via a manually launched persistent Chromium context
// (see tests/helpers/launch_extension.ts), so we don't declare browser projects.
// Conversion + bundling makes individual tests slow, hence the generous timeout.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
});
