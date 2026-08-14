import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Tests run in a real browser, never jsdom. Every claim this library makes is
// about layout the browser actually performed — where a box ended up, and what
// hit-testing returns at a point. jsdom has no layout, so it can confirm none
// of it.
//
// All three engines, because the two features the library is built on are ones
// engines disagree about: what `clip-path: path()` interpolates, and how much of
// anchor positioning exists. Note that Playwright's WebKit is a WebKit build
// rather than Safari: its user agent carries a `Version/` token all the same,
// and that token is not a Safari release anyone can install, so passing here is
// not evidence about any particular Safari.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
