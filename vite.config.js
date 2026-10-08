import { defineConfig } from 'vite'

// GitHub Pages serves the site from /teemate/ (the repo name). The dev server uses /;
// the build and `npm run preview` (which serves the build) use the Pages path.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/teemate/' : '/',
}))
