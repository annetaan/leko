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

/** `#` and its text, or a bullet that opens in bold. */
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*$/gm
const BULLET = /^[ \t]*[-*+][ \t]+\*\*(.+?)\*\*/gm

/** A heading is cited without the full stop the document writes it with. */
const key = (name) => name.trim().replace(/[.,:;]+$/, '')

/**
 * Every name a citation of this document may land on: its headings, and the
 * bold that opens a bullet. A named rule in DESIGN.md is as often a bullet as
 * a section — **Nothing is drawn for the gap** is one, under **Bringing a
 * target into view** — and renaming one breaks a citation of it exactly the
 * way renaming a section does.
 */
export function anchors(markdown) {
  const found = new Set()
  for (const source of [HEADING, BULLET]) {
    for (const [, name] of markdown.matchAll(source)) found.add(key(name))
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
