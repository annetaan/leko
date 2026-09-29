/*
 * Every name a product exports and every `--leko-` custom property its code
 * reads has to be on that product's reference.
 *
 * The reference pages are written by hand rather than generated from the types
 * and the code — the trade issue #6 chose, for prose a generator cannot write.
 * That trade holds only while every name is on a page. A type added to an entry
 * point, or a property a `var()` starts to read, still builds, and nothing else
 * fails on it. Nor does a page that goes on documenting a name after it was
 * renamed.
 *
 * The package has two surfaces, the tour at `.` and Leko Scroll at `./scroll`,
 * and each is held against its own reference directory alone, so a name one
 * product has is `unknown` on the other's pages.
 *
 * The tour also has a stylesheet, and every default it declares has to be the
 * fallback the code reads, for the promise the opening of
 * `docs/src/content/docs/reference/css-custom-properties.mdx` makes.
 *
 * The finding is in `reference.mjs`; this is the disk and the report.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { compare, consumed, declared, defaults, exported } from './reference.mjs'

const SURFACES = [
  {
    name: 'The tour',
    entry: 'packages/leko/src/index.ts',
    sources: ['packages/spotlight/src', 'packages/presenter/src'],
    pages: 'docs/src/content/docs/reference',
    stylesheet: 'packages/spotlight/src/leko.css',
  },
  {
    name: 'Leko Scroll',
    entry: 'packages/leko/src/scroll.ts',
    sources: ['packages/scroll/src'],
    pages: 'docs/src/content/docs/scroll/reference',
  },
]

/** The `.ts` files under `dirs`, tests left out, read as one text. */
const code = (dirs) =>
  dirs
    .flatMap((dir) =>
      readdirSync(dir, { recursive: true })
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
        .map((file) => readFileSync(join(dir, file), 'utf8')),
    )
    .join('\n')

let failed = false
const passed = []

for (const surface of SURFACES) {
  if (!existsSync(surface.pages)) {
    console.error(
      `${surface.pages} is not there, so nothing on ${surface.name} is on its reference.`,
    )
    failed = true
    continue
  }

  const files = readdirSync(surface.pages).filter((file) => file.endsWith('.mdx'))

  if (files.length === 0) {
    console.error(
      `${surface.pages} holds no pages, so nothing on ${surface.name} is on its reference.`,
    )
    failed = true
    continue
  }

  const reads = consumed(code(surface.sources))
  const known = {
    names: exported(readFileSync(surface.entry, 'utf8')),
    properties: new Set(reads.keys()),
  }

  let matching = ''
  if (surface.stylesheet !== undefined) {
    const stylesheet = declared(readFileSync(surface.stylesheet, 'utf8'))
    const parted = defaults(stylesheet, reads)
    const sources = surface.sources.join(' and ')
    for (const finding of parted) {
      if (finding.only === 'stylesheet')
        console.error(
          `${surface.stylesheet}: declares ${finding.name}, which the code in ${sources} never reads`,
        )
      else if (finding.only === 'code')
        console.error(`${finding.name}, from ${sources}, has no default in ${surface.stylesheet}`)
      else if (finding.fallback === undefined)
        console.error(
          `${finding.name}, from ${sources}, is read with no fallback, and ${surface.stylesheet} declares \`${finding.declared}\``,
        )
      else
        console.error(
          `${finding.name}: ${surface.stylesheet} declares \`${finding.declared}\`, and the code in ${sources} falls back to \`${finding.fallback}\``,
        )
    }
    if (parted.length > 0) {
      console.error(
        `\n${surface.name}: stylesheet defaults that are not the code's fallbacks: ${parted.length}.`,
      )
      failed = true
    }
    matching = `, and ${stylesheet.size} stylesheet defaults, every one of them the code's fallback`
  }
  const pages = new Map(
    files.map((file) => [
      join(surface.pages, file),
      readFileSync(join(surface.pages, file), 'utf8'),
    ]),
  )

  const { missing, unknown } = compare(known, pages)
  const from = (name) => (name.startsWith('--') ? surface.sources.join(' and ') : surface.entry)

  if (missing.length > 0 || unknown.length > 0) {
    for (const { name } of missing) {
      console.error(`${name}, from ${from(name)}, is on no page of ${surface.pages}`)
    }
    for (const { file, name } of unknown) {
      console.error(`${file}: documents ${name}, which ${from(name)} does not have`)
    }
    if (missing.length > 0)
      console.error(`\n${surface.name}: names on no page of the reference: ${missing.length}.`)
    if (unknown.length > 0)
      console.error(`\n${surface.name}: names on a page and not in the source: ${unknown.length}.`)
    failed = true
    continue
  }

  passed.push(
    `${surface.name}: ${known.names.size} names and ${known.properties.size} properties, every one of them on its reference${matching}.`,
  )
}

if (failed) process.exit(1)

for (const line of passed) console.log(line)
