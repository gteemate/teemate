// Slow-network timings (npm run test:slow): the real built app (the version members get, which keeps itself on the
// device after the first open) in Chrome at phone size, against the TEST database's scenarios, on simulated poor
// connections. Times each main step and writes test-results/slow-network.json; fails only if something hangs.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'src/test/screens',
  testMatch: '**/*.slow.pw.js',
  timeout: 600000,
  workers: 1, // one shared test database
  reporter: [['list']],
  globalSetup: './src/test/screens/setup.js',
  use: { baseURL: 'http://localhost:5175/teemate/', hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, actionTimeout: 30000 },
  webServer: { command: 'npx vite build --mode test --outDir dist-slow --emptyOutDir && npx vite preview --mode test --outDir dist-slow --port 5175 --strictPort', url: 'http://localhost:5175/teemate/', reuseExistingServer: false, timeout: 180000 },
})
