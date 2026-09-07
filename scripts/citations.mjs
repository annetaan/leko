/*
 * Finding a citation of a heading, and finding the headings it could mean.
 *
 * Both halves are text and nothing else, so `citations.test.mjs` drives them
 * directly and `check-citations.mjs` is left with git, the disk and the report.
 */

/**
 * The documents a citation may point into. Each is at the repository root, and
 * README.md is not one of them: `spike/` holds several of its own, so the name
 * alone does not say which file a citation means.
 */
export const DOCS = ['DESIGN.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'ONBOARDING.md']

/**
 * A document's name and then the heading, in the three ways this repository
 * writes one: `DESIGN.md, **The halo**`, `DESIGN.md's **The halo**`, and
 * anything ending in `under ` — `argues it under`, `states it under`, `asks
 * for under`, `draws the line under`.
 *
 * Matching the wordings rather than a bounded gap is what keeps it from
 * failing both ways. A gap that merely stops at a full stop misses `DESIGN.md
 * argues it in \`plan.ts\` under **The halo**`, silently, which is the one
 * failure that leaves CI green over a renamed heading; and it claims
 * `DESIGN.md is clear that the scrim is **never** clipped`, which is emphasis
 * and not a citation at all. The gap here still refuses `*`, so a citation
 * cannot reach over the emphasis that ends its sentence, and refuses a full
 * stop followed by a space, so it cannot reach into the next sentence —
 * a file name inside it is fine, and that is the whole difference.
 */
export const CITATION = new RegExp(
  String.raw`(${DOCS.join('|')})(?:'s)?,?\s(?:(?:(?!\.\s)[^*]){0,60}?under\s)?\*\*([^*]+?)\*\*`,
  'g',
)

/** `#` and its text, or a bullet that opens in bold, on one unwrapped line. */
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*$/
const BULLET = /^[ \t]*[-*+][ \t]+\*\*(.+?)\*\*/

/**
 * A list item's own line, and a fence as its run of marks and its info string.
 *
 * A closing fence carries no info string in CommonMark, so a ` ```js ` line
 * inside a block is content and not the close of it. Read as a close, the block
 * ends early and the lines after it are taken for the document's own — which is
 * the very reading the fence is dropped to prevent (micromark 4.0.2).
 */
const ITEM = /^[ \t]*[-*+][ \t]/
const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*(.*)$/
const INDENTED = /^[ \t]/

/**
 * A heading is cited without the full stop the document writes it with, and on
 * one line however the document wrapped it. Both sides of the check pass
 * through here, so that agreement is made in one place.
 */
const key = (name) =>
  name
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/[.,:;]+$/, '')

/**
 * The lines a name may be written on, with the document's wrapping taken out:
 * a list item and its continuation lines folded into one, and the inside of a
 * code fence dropped.
 *
 * Folding rather than letting the pattern reach over the newline. `[\s\S]` and
 * `[^*]` both agree with this on the four documents as they stand and give way
 * on the next one written: the moment a bullet's opening bold fails to close,
 * either runs on to the `**` of the *next* bullet, and the dense lists here
 * leave no blank line in the way. Folded, every boundary is one of four named
 * conditions — blank line, indent, marker, fence — rather than a quantifier's
 * appetite.
 *
 * The fence is dropped because the folding is what would make it matter: a
 * `**` on a code line inside a list item is otherwise in reach as the closing
 * half of a bold the bullet left open.
 */
function unwrapped(markdown) {
  const lines = []
  let fence = null
  let item = -1
  for (const line of markdown.split('\n')) {
    const [, marks, info] = FENCE.exec(line) ?? []
    if (fence !== null) {
      if (marks?.startsWith(fence) && info === '') fence = null
    } else if (marks !== undefined) {
      fence = marks
      item = -1
    } else if (ITEM.test(line)) {
      item = lines.push(line) - 1
    } else if (item >= 0 && line.trim() !== '' && INDENTED.test(line)) {
      lines[item] += ` ${line.trim()}`
    } else {
      item = -1
      lines.push(line)
    }
  }
  return lines
}

/**
 * Every name a citation of this document may land on: its headings, and the
 * bold that opens a bullet. A named rule in DESIGN.md is as often a bullet as
 * a section — **Nothing is drawn for the gap** is one, under **Bringing a
 * target into view** — and renaming one breaks a citation of it exactly the
 * way renaming a section does.
 *
 * The invariant that keeps the check honest, which no type here can hold: so
 * long as the bold a bullet opens with closes, an anchor is exactly the string
 * a reader sees in bold at the head of the item.
 *
 * Where it never closes, this and a renderer part company. CommonMark binds a
 * closer to its nearest opener, so a later `**` in the same item opens a bold
 * of its own instead of closing the first, and what a reader sees emphasised is
 * further along; this reads that `**` as the close and keeps the plain run
 * before it (micromark 4.0.2). The divergence is the permissive way round: an
 * extra name nobody can see in bold, so a citation of that fragment would
 * pass — never a name a citation needs and cannot reach. Folding did not open
 * it: a single line diverged the same way. What folding added is its reach into
 * a continuation line, which is the shape `citations.test.mjs` fixes.
 */
export function anchors(markdown) {
  const found = new Set()
  for (const line of unwrapped(markdown)) {
    const name = HEADING.exec(line)?.[1] ?? BULLET.exec(line)?.[1]
    if (name !== undefined) found.add(key(name))
  }
  return found
}

/**
 * A document read a paragraph at a time, each on one line. A citation is a
 * document's name and the bold that follows it, so a file flattened whole
 * makes a paragraph that ends in a bare name and a bullet that opens in bold
 * below it into one citation of a heading nobody wrote — and both DESIGN.md
 * and CLAUDE.md are full of bullets that open in bold.
 */
export function paragraphs(source) {
  return source.split(/\n\s*\n/).map((paragraph) => paragraph.replaceAll(/\s+/g, ' '))
}

/** Every citation in the text, as the document named and the heading wanted. */
export function citations(text) {
  return Array.from(text.matchAll(CITATION), ([, doc, heading]) => ({ doc, heading: key(heading) }))
}
