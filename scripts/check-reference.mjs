/*
 * Every name the package exports and every `--leko-` custom property it
 * declares has to be on the reference.
 *
 * The reference pages are written by hand rather than generated from the types
 * and the stylesheet — the trade issue #6 chose, for prose a generator cannot
 * write. That trade holds only while every name is on a page. A type added to
 * the entry point, or a property added to the stylesheet, still builds, and
 * nothing else fails on it. Nor does a page that goes on documenting a name
 * after it was renamed.
 *
 * The finding is in `reference.mjs`; this is the disk and the report.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { compare, exported, properties } from './reference.mjs'

/**
 * The tour's entry point, `.`. The package exports `./scroll` as well, which is
 * Leko Scroll's surface and is not checked here.
 */
const ENTRY = 'packages/leko/src/index.ts'

const STYLESHEET = 'packages/spotlight/src/leko.css'

const PAGES = 'docs/src/content/docs/reference'

if (!existsSync(PAGES)) {
  console.error(`${PAGES} is not there, so nothing on the public surface is on the reference.`)
  process.exit(1)
}

const files = readdirSync(PAGES).filter((file) => file.endsWith('.mdx'))

if (files.length === 0) {
  console.error(`${PAGES} holds no pages, so nothing on the public surface is on the reference.`)
  process.exit(1)
}

const known = {
  names: exported(readFileSync(ENTRY, 'utf8')),
  properties: properties(readFileSync(STYLESHEET, 'utf8')),
}
const pages = new Map(
  files.map((file) => [join(PAGES, file), readFileSync(join(PAGES, file), 'utf8')]),
)

const { missing, unknown } = compare(known, pages)

if (missing.length > 0 || unknown.length > 0) {
  for (const { name } of missing) {
    const from = name.startsWith('--') ? STYLESHEET : ENTRY
    console.error(`${name}, from ${from}, is on no page of the reference`)
  }
  for (const { file, name } of unknown) {
    const from = name.startsWith('--') ? STYLESHEET : ENTRY
    console.error(`${file}: documents ${name}, which ${from} does not have`)
  }
  if (missing.length > 0) console.error(`\nNames on no page of the reference: ${missing.length}.`)
  if (unknown.length > 0)
    console.error(`\nNames on a page and not in the source: ${unknown.length}.`)
  process.exit(1)
}

console.log(
  `${known.names.size} names and ${known.properties.size} properties, every one of them on the reference.`,
)
