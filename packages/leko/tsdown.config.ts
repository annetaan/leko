import { defineConfig } from 'tsdown'

/*
 * `@annetaan/leko` is the only package here that publishes, and it is built by
 * a bundler rather than by `tsc` for one reason: the two packages it is made of
 * are not published.
 *
 * `tsc` emits one file per source file and leaves every import specifier as it
 * found it, so `dist/leko.js` asked npm for `@annetaan/leko-machine` and
 * `dist/presenter.d.ts` asked the compiler for it. Both are `private: true` and
 * neither is on the registry, so the published package could not resolve its
 * own imports. Nothing in CI could see it either, because inside the workspace
 * both resolve perfectly well. `pnpm check:pack` is what sees it now.
 *
 * So the two halves are bundled in, and they stay private. What a consumer
 * installs is one package with no runtime dependencies, which is what
 * `packages/leko` promised in the first place.
 */
export default defineConfig({
  entry: 'src/index.ts',
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
    // The whole point: `@annetaan/leko-machine` and `@annetaan/leko-spotlight`
    // are workspace `devDependencies`, so both are bundled rather than left as
    // imports for npm to resolve. A third-party dependency would be a
    // `dependencies` entry, and `packages/leko` deliberately has none — see
    // CLAUDE.md.
    alwaysBundle: [/^@annetaan\//],
  },
  clean: true,
})
