import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Two projects, because two kinds of claim are being tested and they need
// different ground to stand on.
//
// `core` runs in real browsers, never jsdom. Every claim that package makes is
// about layout the browser actually performed — where a box ended up, and what
// hit-testing returns at a point. jsdom has no layout, so it can confirm none of
// it.
//
// All three engines, because the two features the library is built on are ones
// engines disagree about: what `clip-path: path()` interpolates, and how much of
// anchor positioning exists. Note that Playwright's WebKit is a WebKit build
// rather than Safari: its user agent carries a `Version/` token all the same,
// and that token is not a Safari release anyone can install, so passing here is
// not evidence about any particular Safari.
//
// `codegen` reads TypeScript source and writes a file. There is no layout in any
// of that and no DOM to be wrong about, and it wants the compiler API and the
// filesystem instead. Running it three times in three browsers would prove
// nothing and cost three times as much.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          include: ['packages/core/src/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
      {
        test: {
          name: 'codegen',
          include: ['packages/codegen/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
