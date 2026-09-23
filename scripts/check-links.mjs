/*
 * Every link inside the documentation site has to land.
 *
 * Every link a page writes by hand goes through `href()`, and
 * `docs/src/lib/href.ts` says why. A link that skipped it still builds, and
 * nothing else fails on it.
 *
 * This reads the built site and not its source. A checker reading MDX sees
 * `href={href('/demo/')}` as an expression and never as a link, so it cannot
 * tell the link that went through `href()` from the one that did not. The
 * rendered HTML is the only place every link is a string.
 *
 * The finding is in `links.mjs`; this is the disk and the report.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path/posix'
import { broken, internal } from './links.mjs'

/**
 * A copy of `base` in `docs/astro.config.mjs`, which is the one that counts.
 * Importing the config would keep one copy, and fails in Node: Starlight ships
 * its entry point as TypeScript inside `node_modules`, which Node will not
 * strip. A copy that falls behind fails loudly, with every link on the site
 * reported as outside the base.
 */
const BASE = '/leko'

const DIST = 'docs/dist'

if (!existsSync(DIST)) {
  console.error(`${DIST} is not there. Run \`pnpm build\` first.`)
  process.exit(1)
}

const files = new Set(
  readdirSync(DIST, { recursive: true }).filter((file) => statSync(join(DIST, file)).isFile()),
)
const pages = new Map(
  [...files]
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file, readFileSync(join(DIST, file), 'utf8')]),
)

const found = broken(pages, files, BASE)

const said = {
  'outside base': (href) => `${href} is written without the base`,
  'no page': (href) => `${href} lands on nothing in the build`,
  'no fragment': (href) => `${href} names an id the page it lands on does not carry`,
}

if (found.length > 0) {
  for (const { page, href, reason } of found) {
    console.error(`${join(DIST, page)}: ${said[reason](href)}`)
  }
  console.error(`\n${found.length} internal links do not land.`)
  process.exit(1)
}

console.log(`${[...internal(pages, BASE)].length} internal links, every one of them landing.`)
