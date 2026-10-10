// Screen-size checks (npm run test:screens): the real app in a real browser (Chrome) at phone and iPad sizes,
// against the TEST database's scenarios. Every main screen is opened like a member would, then checked: nothing off
// the edge, no sideways scrolling, every button big enough and not covered by anything. Screenshots of each screen
// at each size go into test-results/screens (open test-results/screens/index.html to flick through them).
import { defineConfig } from '@playwright/test'

export const SIZES = {
  'small-android': { width: 360, height: 740 },
  'iphone-se': { width: 375, height: 667 },
  'iphone-pro-max': { width: 430, height: 932 },
  'ipad': { width: 1024, height: 768 },
}

export default defineConfig({
  testDir: 'src/test/screens',
  testMatch: '**/*.pw.js', // (not *.spec.js, which the quick `npm test` would pick up)
  timeout: 120000,
  workers: 1, // one shared test database
  reporter: [['list']],
  globalSetup: './src/test/screens/setup.js',
  use: { baseURL: 'http://localhost:5174', hasTouch: true, actionTimeout: 10000, screenshot: 'only-on-failure' }, // a tap that can't happen in 10s fails
  projects: Object.entries(SIZES).map(([name, viewport]) => ({ name, use: { viewport, isMobile: name !== 'ipad', deviceScaleFactor: 2 } })),
  webServer: { command: 'npx vite --mode test --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: false, timeout: 60000 },
})
