import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Ten projects, and what puts a test in each — ONBOARDING.md, **Which Vitest
// project a new test belongs in**. The tour's three browser projects are never
// jsdom for the reason DESIGN.md gives under **How to write here, and where
// tests go**, and `presenter` is what DESIGN.md argues under **Where a class
// has to wait on more than one thing, its mode is one union and a pure function
// says what an event does to it**. The fourth, `scroll`, is Leko Scroll's
// shell, in browsers for the reason
// [The core and the shell](packages/scroll/DESIGN.md#the-core-and-the-shell)
// gives.
//
// One project per package rather than one shared glob, so a project can move to
// another environment without dragging the rest with it.
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
  // The `development` export condition, so a test never passes against a stale
  // dist/.
  resolve: { conditions: ['development'] },
  test: {
    projects: [
      {
        test: {
          name: 'spotlight',
          include: ['packages/spotlight/src/**/*.test.ts'],
          // A glob and one exclusion rather than a list, so a new test here
          // goes to the browsers by default, which is where a test of this
          // package belongs unless it asks for nothing from one.
          exclude: ['packages/spotlight/src/geometry.test.ts'],
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
          // suite puts three browsers on a two-core runner, where `harness.ts`
          // records what one animation frame has been seen to cost there. What
          // that costs a healthy machine is nothing: every one of those tests
          // waits on the thing it is about and returns as soon as it happens.
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
          name: 'presenter',
          include: ['packages/presenter/src/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'spotlight-geometry',
          include: ['packages/spotlight/src/geometry.test.ts'],
          environment: 'node',
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
      {
        test: {
          name: 'scroll',
          include: ['packages/scroll/src/**/*.test.ts'],
          // The core's three run in Node, under `scroll-core`.
          exclude: [
            'packages/scroll/src/geometry.test.ts',
            'packages/scroll/src/mask.test.ts',
            'packages/scroll/src/plan.test.ts',
          ],
          browser: browsers(),
          // Every test here waits on a frame loop, and this suite puts three
          // browsers on a two-core runner — the reason the `leko` project gives.
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: 'scroll-core',
          include: [
            'packages/scroll/src/geometry.test.ts',
            'packages/scroll/src/mask.test.ts',
            'packages/scroll/src/plan.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'scripts',
          include: ['scripts/**/*.test.mjs'],
          environment: 'node',
        },
      },
    ],
  },
})
