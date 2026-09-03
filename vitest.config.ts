import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// One project per package, because two kinds of claim are being tested and they
// need different ground to stand on. One per package rather than one shared
// glob, so that a project can move to another environment without dragging the
// rest with it.
//
// `spotlight`, `leko` and `leko-wiring` run in real browsers, never jsdom.
// Every claim those three make is about a page that a browser laid out, and
// jsdom has no layout to confirm any of it with.
//
// `spotlight` and `leko` run in all three engines, because the two features the
// library is built on are ones engines disagree about: what `clip-path: path()`
// interpolates, and how much of anchor positioning exists. Note that
// Playwright's WebKit is a WebKit build rather than Safari: its user agent
// carries a `Version/` token all the same, and that token is not a Safari
// release anyone can install, so passing here is not evidence about any
// particular Safari.
//
// `leko-wiring` runs in one. It drives the public API through the real
// `DomPresenter` to pin down which step the tour is on and when it says so, and
// no engine has an opinion about that. Those tests lived in `leko` and were run
// three times to prove things like `meta` being carried unread. Splitting them
// out is the same coverage for a third of the browser time; what decides which
// file a test belongs in is whether the browser could get it wrong.
//
// `machine` and `codegen` run in Node. Neither has a DOM to be wrong about.
// `machine` decides which step a tour is on, against a presenter the test
// writes, and its package takes no `lib.dom` at all. `codegen` reads TypeScript
// source and writes a file, and wants the compiler API and the filesystem
// instead. Running either three times in three browsers would prove nothing and
// cost three times as much.
//
// A function rather than one shared object, because Vitest names the per-browser
// projects it derives by mutating what it is handed. Two projects sharing one
// object end up fighting over the name `spotlight (chromium)`.
const browsers = () => ({
  enabled: true,
  headless: true,
  provider: playwright(),
  instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
})

export default defineConfig({
  // Resolve workspace packages through their `development` export condition,
  // which points at src. A test that passes against a stale dist/ proves
  // nothing about the source it was meant to be about.
  resolve: { conditions: ['development'] },
  test: {
    projects: [
      {
        test: {
          name: 'spotlight',
          include: ['packages/spotlight/src/**/*.test.ts'],
          browser: browsers(),
        },
      },
      {
        test: {
          name: 'leko',
          include: ['packages/leko/src/leko.test.ts', 'packages/leko/src/message.test.ts'],
          browser: browsers(),
          // Vitest's default of 5s is not enough for the tests about a step that
          // scrolls, on CI. Those wait for animations the browser owns — a
          // morph, and a smooth scroll whose length is the engine's — and this
          // suite puts three browsers on a two-core runner, where a single
          // animation frame has been watched taking more than three seconds.
          // What that costs a healthy machine is nothing: every one of those
          // tests waits on the thing it is about and returns as soon as it
          // happens.
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: 'leko-wiring',
          include: ['packages/leko/src/wiring.test.ts'],
          browser: { ...browsers(), instances: [{ browser: 'chromium' }] },
        },
      },
      {
        test: {
          name: 'machine',
          include: ['packages/machine/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'codegen',
          include: ['packages/codegen/src/**/*.test.ts'],
          environment: 'node',
          // Each of these builds a real TypeScript program over the fixture,
          // which is CPU work and not waiting. Vitest's default of 5s was
          // enough until a fourth project joined the other three on a two-core
          // CI runner: the slowest one went from 2188ms to 5150ms there while
          // the suite as a whole went from 12.17s to 18.20s doing less work.
          // Nothing about the program explains it. It grew from 10 files to 17
          // when the core split, and that costs 9ms on this machine.
          testTimeout: 30_000,
        },
      },
    ],
  },
})
