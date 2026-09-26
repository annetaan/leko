import { defineConfig } from 'tsdown'

/*
 * A bundler rather than `tsc`, because the workspace packages this one is made
 * of are not published — CONTRIBUTING.md, **What `@annetaan/leko` ships**.
 */
export default defineConfig({
  entry: { index: 'src/index.ts', scroll: 'src/scroll.ts' },
  format: 'esm',
  dts: true,
  sourcemap: true,
  outDir: 'dist',
  // `.js`, not the `.mjs` tsdown defaults to. The package is `type: module`, so
  // `.js` is already ESM, and `exports` has pointed at `index.js` since before
  // any of this — a published entry point is not worth renaming to suit a build
  // tool.
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: {
    // The five workspace packages this one is made of are `devDependencies`, so
    // all five are bundled rather than left as imports for npm to resolve;
    // `@annetaan/leko-scroll` is the one behind `./scroll`. CLAUDE.md, **Adding
    // a third-party runtime dependency to `packages/leko`**, is why there is
    // nothing else here for this to reach.
    alwaysBundle: [/^@annetaan\//],
  },
  clean: true,
})
