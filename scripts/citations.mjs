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

/** Their names as one alternation: what a citation may name, and what its run-up may not cross. */
const NAMES = DOCS.join('|')

/**
 * How far a citation may reach on its way to `under`. Four named conditions
 * and no length:
 *
 * - Not into the next sentence — a stop, a question mark or an exclamation
 *   mark *followed by a space*. A bare full stop will not do: the dot of
 *   `plan.ts` would end the run-up, and naming a file on the way to the
 *   heading is this repository's habit.
 * - Not over the emphasis that ends this sentence — `[^*]`.
 * - Not past another document's name, so the nearer name wins. `CONTRIBUTING.md
 *   says the rule DESIGN.md argues under **The halo**` was read as
 *   CONTRIBUTING.md's heading before this, and failed for a heading that is
 *   there.
 * - Not out of a table cell — `[^|]`, which is a boundary only because
 *   `paragraphs` folds a table onto one line and puts the next cell in reach.
 *
 * A length stood here instead, sixty characters, with no reason written for it
 * anywhere, and it cost four citations whose run-up names a file and a reason
 * and runs longer than that. Silently, which is the one failure that leaves CI
 * green over a renamed heading.
 *
 * What ports from `unwrapped` is not its answer — that one folds the text
 * before matching, and there is nothing to fold here, because `paragraphs` has
 * folded it already. What ports is the reason the answer worked: a boundary is
 * a set of named conditions rather than a quantifier's appetite.
 */
const RUN_UP = String.raw`(?:(?![.?!]\s)(?!${NAMES})[^*|])*?`

/**
 * A document's name and then the heading, in the three ways this repository
 * writes one: `DESIGN.md, **The halo**`, `DESIGN.md's **The halo**`, and
 * anything ending in `under ` — `argues it under`, `states it under`, `asks
 * for under`, `draws the line under`.
 *
 * Matching the wordings rather than any run-up at all is what keeps it from
 * claiming `DESIGN.md is clear that the scrim is **never** clipped`, which is
 * emphasis and not a citation.
 */
export const CITATION = new RegExp(
  String.raw`(${NAMES})(?:'s)?,?\s(?:${RUN_UP}under\s)?\*\*([^*]+?)\*\*`,
  'g',
)

/**
 * What opens a list item: a bullet, or the number of an ordered one. Nine
 * digits is where CommonMark stops calling it a list.
 */
const MARKER = String.raw`(?:[-*+]|\d{1,9}[.)])`

/** `#` and its text, or a list item that opens in bold, on one unwrapped line. */
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*$/
const BULLET = new RegExp(String.raw`^[ \t]*${MARKER}[ \t]+\*\*(.+?)\*\*`)

/** A list item's own line, and a fence as its run of marks and its info string. */
const ITEM = new RegExp(String.raw`^[ \t]*${MARKER}[ \t]`)
const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*(.*)$/
const INDENTED = /^[ \t]/

/**
 * The markdown with every fenced block blanked out. A citation shown inside a
 * fence is one nobody wrote, and a `#` line in a fenced shell script is
 * nobody's heading — so both the names a document offers and the citations it
 * makes are read from here.
 *
 * A closing fence carries no info string in CommonMark, so a ` ```js ` line
 * inside a block is content and not the close of it. Read as a close, the block
 * ends early and the lines after it are taken for the document's own — which is
 * the very reading the fence is dropped to prevent (micromark 4.0.2).
 *
 * Blank lines rather than no lines, so what surrounded a block is still two
 * paragraphs and not one.
 */
export function defenced(markdown) {
  const lines = []
  let fence = null
  for (const line of markdown.split('\n')) {
    const [, marks, info] = FENCE.exec(line) ?? []
    if (fence !== null) {
      if (marks?.startsWith(fence) && info === '') fence = null
      lines.push('')
    } else if (marks !== undefined) {
      fence = marks
      lines.push('')
    } else {
      lines.push(line)
    }
  }
  return lines.join('\n')
}

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
 * a list item and its continuation lines folded into one, over what `defenced`
 * has already blanked.
 *
 * Folding rather than letting the pattern reach over the newline. `[\s\S]` and
 * `[^*]` both agree with this on the four documents as they stand and give way
 * on the next one written: the moment a bullet's opening bold fails to close,
 * either runs on to the `**` of the *next* bullet, and the dense lists here
 * leave no blank line in the way. Folded, every boundary is one of four named
 * conditions — blank line, indent, marker, fence — rather than a quantifier's
 * appetite.
 *
 * The folding is what makes `defenced` matter here: a `**` on a code line
 * inside a list item is otherwise in reach as the closing half of a bold the
 * bullet left open.
 */
function unwrapped(markdown) {
  const lines = []
  let item = -1
  for (const line of defenced(markdown).split('\n')) {
    if (ITEM.test(line)) {
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
 * bold that opens a list item. A named rule in DESIGN.md is as often a bullet
 * as a section — **Nothing is drawn for the gap** is one, under **Bringing a
 * target into view** — and renaming one breaks a citation of it exactly the
 * way renaming a section does. As often a numbered item, too: the three
 * constraints CLAUDE.md and CONTRIBUTING.md open with are the most cited rules
 * in the repository and each is the bold of a `1.`.
 *
 * The head of the item is the whole of it. Bold further along is emphasis as
 * often as it is a name — measured over DESIGN.md, more often — so taking it
 * would leave the check with no way to tell a rule's name from a word somebody
 * stressed.
 *
 * The invariant that keeps the check honest, which no type here can hold: so
 * long as the bold an item opens with closes, an anchor is exactly the string
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

/**
 * `CITATION` with the conjunction widened as far as it can be widened without
 * reporting anything: `under`, `in`, `at`, and a colon.
 *
 * Not the words the repository writes. Counted over the files
 * `check-citations.mjs` reads, it writes `under` 94 times; `in`, `at` and a
 * colon it writes nowhere in the tree at all — the colon this branch found in
 * `geometry.ts` was the only one, and it is now written as one of the three.
 * Each word is here because adding it was measured to report nothing that
 * `citations` had not already read, which is the same test an em dash failed:
 * DESIGN.md and this file both open an aside with one in order to give a
 * heading as an example, and an example is not a citation. So the words are
 * the ones a wording may reach for next, not the ones it has.
 *
 * A colon is also why the set cannot simply be given to `CITATION`. It
 * introduces a list, an example or a stressed word as readily as it introduces
 * a name, so a sentence shaped `<doc> says this: **never** clip the scrim`
 * would fail for a heading nobody claimed.
 *
 * The words are held off a word character and a hyphen both. A `\b` alone
 * reports `built-in **guarantee**` and `opt-in **flag**`, because a hyphen is
 * not a word character and so a boundary stands right before the `in`. A
 * `(?<=\s)` goes too far the other way and misses `<doc> (in **The halo**)`,
 * which is a wording nobody can read and exactly what this is for.
 */
const WORDING = new RegExp(
  String.raw`(${NAMES})(?:'s)?,?\s(?:${RUN_UP}(?:(?<![\w-])(?:under|in|at)|:)\s)?\*\*([^*]+?)\*\*`,
  'g',
)

/**
 * The runs that look like a citation of a heading and that `citations` did not
 * read.
 *
 * The wordings are an open set: a writer reaches for the word the sentence
 * wants, and no list of them is ever finished. So the one direction this must
 * not fail in is silence. A heading named in prose the check cannot parse is a
 * heading nobody can rename safely and nothing anywhere says so — which is the
 * whole failure the check exists to prevent, arrived at from the other side.
 * Reported rather than read, so widening the words can never make the check
 * claim a heading a writer did not name.
 *
 * The difference is taken over where the matches end, which is the closing
 * `**` of the heading each one names.
 */
export function unread(text) {
  const read = new Set(
    Array.from(text.matchAll(CITATION), (found) => found.index + found[0].length),
  )
  return Array.from(text.matchAll(WORDING))
    .filter((found) => !read.has(found.index + found[0].length))
    .map((found) => found[0])
}

/**
 * What a heading answers to as a link fragment: GitHub's own spelling, which
 * lowercases, drops everything that is not a letter, a digit, a space, an
 * underscore or a hyphen, and turns each space into a hyphen.
 *
 * Each space, not each run of them. `### Resolution & custom functions` is
 * `resolution--custom-functions`, because dropping the `&` leaves the spaces
 * either side of it behind.
 */
const spelling = (name) =>
  name
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N} _-]/gu, '')
    .replaceAll(' ', '-')

/**
 * Every fragment this document answers to. Two headings spelling the same one
 * is not something the repository has, so the numbering GitHub gives the
 * second — the spelling with `-1` after it — is held down by a test rather
 * than by the tree.
 *
 * Nothing folded and no list items: a fragment is a heading's, and a heading
 * does not wrap. Fenced, though, because a `#` line in a fenced shell script
 * is nobody's heading and STATE-HEALTH.md has seven of them.
 */
export function slugs(markdown) {
  const found = new Set()
  const taken = new Map()
  for (const line of defenced(markdown).split('\n')) {
    const name = HEADING.exec(line)?.[1]
    if (name === undefined) continue
    const spelt = spelling(name)
    const before = taken.get(spelt) ?? 0
    taken.set(spelt, before + 1)
    found.add(before === 0 ? spelt : `${spelt}-${before}`)
  }
  return found
}

/** A link through the repository's own URL, down to the path inside it. */
const BLOB = /^https:\/\/github\.com\/annetaan\/leko\/blob\/[^/]+\//

/**
 * `](path#fragment)`, with the title CommonMark allows after a destination.
 * The path may be empty, meaning this file; the fragment may not.
 *
 * The title is not an edge case. A link that carries one is ordinary markdown,
 * and while this did not match it the fragment left the check altogether —
 * silently, with nothing a reader could see to say so. The destination
 * spellings this reads are written out in `citations.test.mjs`, where they are
 * code and not prose: an example of a link inside a comment is a link, and
 * this check reads it.
 *
 * A reference link, `[text][ref]` with its destination on a `[ref]:` line, is
 * a second grammar and is not read. Nothing here writes one.
 */
const LINK = /\]\(\s*([^\s)#]*)#([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g

/**
 * Every link into a heading, as the file it names and the fragment it wants.
 * A link with no fragment names no heading, so it is not one of these; nor is
 * a bare `#`.
 *
 * A fragment is decidable in a way the bold wordings are not — the spelling
 * follows from the heading by a function, with nothing to guess — which is
 * what makes this half of the check exact.
 *
 * The path comes back as the link wrote it, except that a link through the
 * repository's own URL becomes a path from the root, leading slash and all.
 * The issue templates and `packages/codegen/README.md` link that way because
 * neither is read from anywhere a relative path resolves: a GitHub issue form,
 * and a package page on the registry.
 */
export function links(text) {
  return Array.from(text.matchAll(LINK), ([, target, fragment]) => ({
    target: BLOB.test(target) ? `/${target.replace(BLOB, '')}` : target,
    fragment,
  }))
}
