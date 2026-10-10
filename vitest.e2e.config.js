// End-to-end tests: the real app against the TEST database (npm run test:e2e). Kept out of `npm test`, which is
// quick and offline. Runs one file at a time: the tests share the test database.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/test/e2e/**/*.e2e.js'],
    environment: 'happy-dom',
    // The simulated browser's own cross-site checks drop the sign-in token on calls to the database; the real
    // database allows the app's calls, so let them through as a browser would.
    environmentOptions: { happyDOM: { url: 'http://localhost:5173/', settings: { fetch: { disableSameOriginPolicy: true } } } },
    globalSetup: ['src/test/e2e/setup.js'],
    testTimeout: 120000,
    hookTimeout: 300000,
    fileParallelism: false,
  },
})
