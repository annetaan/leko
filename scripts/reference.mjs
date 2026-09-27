/*
 * Finding the names the public surface has, and the names the reference pages
 * document.
 *
 * Text in and findings out, so `reference.test.mjs` drives it directly and
 * `check-reference.mjs` is left with the disk and the report.
 */
import { defenced } from './citations.mjs'

/**
 * The braces of an `export { … } from` or an `export type { … } from`. The
 * `from` is what keeps it to a re-export, which is the only way the entry point
 * exports anything. `[^}]` crosses a newline, so a block written one name to a
 * line is read whole.
 *
 * A bare `export * from` names nothing, so it has no braces to match, and an
 * `export default` has no braces either.
 */
const EXPORT_BLOCK = /\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\b/g

/**
 * A line comment or a block comment, taken out of the source before anything
 * else reads it. Left in, a comment beside a name makes a piece of the block
 * that `SPECIFIER` cannot read, and a `}` inside one ends the block early. A
 * module specifier with `//` in it would be cut too, and the entry point
 * imports none.
 */
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g

/**
 * One name inside the braces: a `type` in front of it, which marks that one
 * name as a type inside a value block, and an alias after it. The alias is the
 * name a consumer imports, so it is the one that comes back.
 */
const SPECIFIER = /^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/

/**
 * A custom property as a declaration: at the start of a line, before its colon.
 * Anchored to the line so a `var(--leko-z)` is a use and not a declaration, and
 * so a comment naming one in prose — which sits behind a ` * ` — is not one
 * either.
 */
const PROPERTY = /^\s*(--leko-[\w-]+)\s*:/gm

/**
 * The inline code that opens a table row. Only the first cell, because the
 * later ones hold a type or a default, and `` `LekoRegion[]` `` in a type
 * column is a mention and not the row that documents it.
 */
const FIRST_CELL = /^\|\s*`([^`]+)`/

/**
 * A heading whose whole text is one identifier, with or without backticks. A
 * heading of several words, such as `## Signal types`, is a section and names
 * nothing, so the text may not contain a space.
 */
const HEADING = /^#{2,6}[ \t]+`?([^`\s]+)`?[ \t]*$/

/**
 * What `compare` judges when a page documents it. A name that fits neither is
 * a field, a member or a problem's `kind`, which this check does not read from
 * the source and so has nothing to hold it against.
 */
const JUDGED = /^(?:Leko[A-Z]\w*|--leko-[\w-]+)$/

/**
 * Every name the entry point exports, value and type alike.
 *
 * A piece of a block that is not a name throws rather than being skipped. A
 * skipped name is one the check stops reading, and it then passes however many
 * pages leave that name out. Only the empty piece after a trailing comma is
 * skipped.
 */
export function exported(source) {
  const found = new Set()
  for (const [, block] of source.replaceAll(COMMENT, '').matchAll(EXPORT_BLOCK)) {
    for (const piece of block.split(',')) {
      const specifier = piece.trim()
      if (specifier === '') continue
      const [, name, alias] = SPECIFIER.exec(specifier) ?? []
      if (name === undefined) throw new Error(`Cannot read \`${specifier}\` as an exported name.`)
      found.add(alias ?? name)
    }
  }
  return found
}

/** Every `--leko-` custom property the stylesheet declares. */
export function properties(css) {
  return new Set(Array.from(css.matchAll(PROPERTY), ([, name]) => name))
}

/**
 * Every name a page documents: the inline-code first cell of a table row, and
 * a heading that is one identifier. Read over `defenced`, so a table or a
 * heading shown inside a code fence documents nothing. In the order the page
 * writes them, so a report lists a page's findings the way a reader meets them.
 */
export function named(markdown) {
  const found = new Set()
  for (const line of defenced(markdown).split('\n')) {
    const name = FIRST_CELL.exec(line)?.[1] ?? HEADING.exec(line)?.[1]
    if (name !== undefined) found.add(name)
  }
  return found
}

/**
 * What the reference and the source disagree on. `known` is `{ names,
 * properties }`, each a Set, and `pages` maps each page's file to its markdown.
 *
 * `missing` is every known name documented on no page. `unknown` is every name
 * a page documents that looks like one of the two, `Leko…` or `--leko-…`, and
 * that the source does not have, with the page it is on — a renamed type, or
 * one the entry point does not export.
 */
export function compare(known, pages) {
  const all = new Set([...known.names, ...known.properties])
  const documented = new Set()
  const unknown = []
  for (const [file, markdown] of pages) {
    for (const name of named(markdown)) {
      documented.add(name)
      if (JUDGED.test(name) && !all.has(name)) unknown.push({ file, name })
    }
  }
  const missing = [...all].filter((name) => !documented.has(name)).map((name) => ({ name }))
  return { missing, unknown }
}
