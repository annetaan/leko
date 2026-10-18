import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'
import { slugs } from '../../scripts/citations.mjs'
import { cite } from '../../scripts/cite.mjs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const root = fileURLToPath(new URL('../../', import.meta.url))
const base = `https://github.com/annetaan/leko/blob/v${version}/`
const headings = new Map()
// What `cite` asks of a `Map`, read from the disk for the files it cites and no others.
const anchors = {
  get(path: string) {
    if (!headings.has(path)) {
      const file = `${root}${path}`
      const found =
        path.endsWith('.md') && existsSync(file) ? slugs(readFileSync(file, 'utf8')) : undefined
      headings.set(path, found)
    }
    return headings.get(path)
  },
}

/*
 * A bundler rather than `tsc`, because the workspace packages this one is made
 * of are not published — CONTRIBUTING.md, **What `@annetaan/leko` ships**.
 */
export default defineConfig({
  entry: { index: 'src/index.ts', scroll: 'src/scroll.ts' },
  format: 'esm',
  dts: true,
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
  plugins: [
    // CONTRIBUTING.md, **What `@annetaan/leko` ships**.
    {
      name: 'cite',
      transform: {
        order: 'pre',
        handler(code, id) {
          if (!id.startsWith(root) || id.includes('/node_modules/')) return null
          const out = cite(code, { file: id, root, base, anchors })
          return out === code ? null : { code: out }
        },
      },
    },
  ],
})
