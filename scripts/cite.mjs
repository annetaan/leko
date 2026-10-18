/*
 * What the published files cite has to resolve for someone holding only the
 * tarball, so every citation and repository link in a bundled module's
 * comments is pointed at the tree tagged for the version — CONTRIBUTING.md,
 * **What `@annetaan/leko` ships**.
 */
import { posix } from 'node:path'

import { NAME, citations, CITATION, destinations, spelling } from './citations.mjs'
import { passages, ranges } from './comments.mjs'

/** Every run of adjacent comments, as `{ pos, end }`, grouped the way `passages` groups them. */
function runs(code, file) {
  const found = []
  for (const { pos, end } of ranges(code, file)) {
    const last = found.at(-1)
    if (last !== undefined && code.slice(last.end, pos).trim() === '') last.end = end
    else found.push({ pos, end })
  }
  return found
}

/**
 * `#fragment` where `fragment` is a heading of the document at `path`, and
 * nothing where it is not: GitHub makes a fragment for a heading only, so a
 * cited list item or a stale link would claim a place the page does not have.
 */
const anchored = (anchors, path, fragment) =>
  anchors.get(path)?.has(fragment) ? `#${fragment}` : ''

/** The edits one run of comments wants, as `{ from, to, text }` against the whole module. */
function edits(raw, passage, offset, { file, root, base, anchors }) {
  const names = [...raw.matchAll(NAME)]
  const cited = new Map()
  const hits = [...passage.matchAll(CITATION)]
  for (const [index, { doc, heading }] of citations(passage).entries()) {
    const ordinal = [...passage.slice(0, hits[index].index).matchAll(NAME)].length
    cited.set(ordinal, `${base}${doc}${anchored(anchors, doc, spelling(heading))}`)
  }

  const found = []
  for (const [ordinal, name] of names.entries()) {
    const before = raw.slice(Math.max(0, name.index - 2), name.index)
    if (before.endsWith('/') || before.endsWith('[') || before === '](') continue
    const url = cited.get(ordinal) ?? `${base}${name[0]}`
    const from = offset + name.index
    found.push({ from, to: from + name[0].length, text: `[${name[0]}](${url})` })
  }

  for (const { target, fragment, span } of destinations(raw)) {
    if (target === '' || target.startsWith('/') || URL.canParse(target)) continue
    const resolved = posix.resolve(posix.dirname(file), target)
    if (!resolved.startsWith(root)) continue
    const path = posix.relative(root, resolved) + (target.endsWith('/') ? '/' : '')
    const text = `${base}${path}${fragment === undefined ? '' : anchored(anchors, path, fragment)}`
    found.push({ from: offset + span[0], to: offset + span[1], text })
  }
  return found
}

/**
 * `code` with its comments' citations and repository links pointed at `base`.
 * `file` is the module's absolute path, `root` the repository's with a
 * trailing slash, `base` the tagged tree's URL, slash included, and `anchors`
 * the fragments each document answers to, by its path from the root, as
 * `slugs` reads them. Code and
 * strings are never touched, and a link that resolves outside `root` is left
 * for `dangling` to report.
 */
export function cite(code, { file, root, base, anchors }) {
  const texts = passages(code, file)
  const all = runs(code, file).flatMap(({ pos, end }, index) =>
    edits(code.slice(pos, end), texts[index], pos, { file, root, base, anchors }),
  )
  let out = code
  let limit = Infinity
  for (const { from, to, text } of all.toSorted((a, b) => b.from - a.from)) {
    if (to > limit) continue
    out = out.slice(0, from) + text + out.slice(to)
    limit = from
  }
  return out
}
