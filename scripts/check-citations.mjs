/*
 * A citation of a heading has to name a heading that is there.
 *
 * The rule DESIGN.md argues under **Comments are the last place a fact goes**
 * turns prose that was written twice into one copy and a pointer to it. That
 * trade only holds while the pointer lands: a citation of a heading nobody
 * renamed is worth more than the paragraph it replaced, and a citation of one
 * somebody did is worse than nothing, because it looks precise while sending
 * the reader somewhere wrong. Nothing else in the repository checks one — which
 * is the same reason CONTRIBUTING.md gives for never pointing by line number.
 *
 * Three ways to fail, and only the first is loud on its own. A citation that
 * names a heading nobody wrote has always failed. A citation written in a
 * wording this check cannot read passed, and went on passing after somebody
 * renamed the heading, so `unread` reports one. A heading cited by a link's
 * fragment was not read at all, so `links` reads those too — the same pointer,
 * spelt the way a browser follows it.
 *
 * The finding is in `citations.mjs`; this is git, the disk and the report.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path/posix'
import {
  anchors,
  citations,
  defenced,
  DOCS,
  links,
  paragraphs,
  slugs,
  uncommented,
  unread,
} from './citations.mjs'
import { passages } from './comments.mjs'

/**
 * Markdown and YAML are read whole; a source file only through its comments.
 * A citation in YAML is in a comment anyway — `ci.yml` cites the rule beside
 * the step that checks it — and reading the file whole, with only the `#`
 * taken off, saves teaching this a second grammar.
 */
const MARKDOWN = /\.mdx?$/i
const WHOLE = /\.(mdx?|ya?ml)$/

/** The runs of text a citation may be written in, by what the file is. */
const written = (source, file) => {
  if (!WHOLE.test(file)) return passages(source, file)
  // Markdown is the one of the two with fences to drop; YAML is read for its
  // comments, which carry none.
  return paragraphs(MARKDOWN.test(file) ? defenced(source) : uncommented(source))
}

/**
 * Everything but `spike/`. Those pages are evidence, dated and left as they
 * stood — one of them is attached to a Chromium bug — so what they cite is a
 * record of what was written when they were, and not prose anybody maintains.
 *
 * `.mdx` because the documentation site's prose is written in it. Not `.astro`
 * or `.html`, which are markup and script rather than prose, and which cite
 * nothing today.
 */
const globs = ['*.ts', '*.tsx', '*.mjs', '*.md', '*.mdx', '*.yml', '*.yaml']
const files = execFileSync('git', ['ls-files', ...globs], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file && !file.startsWith('spike/'))

const known = new Map(DOCS.map((doc) => [doc, anchors(readFileSync(doc, 'utf8'))]))

/**
 * Every tracked markdown file, because a link carries a path and so says which
 * file it means — the ambiguity that keeps `DOCS` to four does not arise here.
 * `spike/` is among them: those pages are left as they stood, which is a reason
 * not to read what they cite and no reason at all that a heading inside one is
 * safe to rename.
 */
const targets = new Set(
  execFileSync('git', ['ls-files', '*.md', '*.mdx'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean),
)

const spelt = new Map()
const fragments = (file) => {
  if (!spelt.has(file)) spelt.set(file, slugs(readFileSync(file, 'utf8')))
  return spelt.get(file)
}

/** Where a link's path lands: from the citing file's own directory, or from the root. */
const lands = (file, target) => {
  if (target === '') return file
  return target.startsWith('/') ? target.slice(1) : join(dirname(file), target)
}

const wrong = []
const unreadable = []
const missing = []
const unresolved = []
let counted = 0
let linked = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const text of written(source, file)) {
    for (const { doc, heading } of citations(text)) {
      counted++
      if (!known.get(doc).has(heading)) wrong.push({ file, doc, heading })
    }
    for (const wording of unread(text)) unreadable.push({ file, wording })
    for (const { target, fragment } of links(text)) {
      const into = lands(file, target)
      if (targets.has(into)) {
        linked++
        if (!fragments(into).has(fragment)) missing.push({ file, into, fragment })
      } else if (MARKDOWN.test(into)) {
        // A markdown path that resolves to nothing tracked. Not the same thing
        // as a link this check has no business reading, and the difference has
        // to be said out loud: skipped quietly, a typo in the path or a `.MD`
        // that macOS opens and GitHub answers 404 for takes its fragment out
        // of the count and leaves the report saying every one of them landed.
        unresolved.push({ file, into, fragment })
      }
      // Anything else — an external URL, a path that is not markdown — cites
      // no heading in this repository.
    }
  }
}

if (wrong.length > 0 || unreadable.length > 0 || missing.length > 0 || unresolved.length > 0) {
  for (const { file, doc, heading } of wrong) {
    console.error(`${file}: ${doc} has no heading "${heading}"`)
  }
  for (const { file, wording } of unreadable) {
    console.error(
      `${file}: looks like a citation and is not one this check can read — "${wording}"`,
    )
  }
  for (const { file, into, fragment } of missing) {
    console.error(`${file}: ${into} has no heading spelt "${fragment}"`)
  }
  for (const { file, into, fragment } of unresolved) {
    console.error(`${file}: nothing tracked at ${into}, so "#${fragment}" was never checked`)
  }
  if (wrong.length > 0) {
    console.error(`\n${wrong.length} of ${counted} citations point at a heading that is not there.`)
  }
  if (missing.length > 0) {
    console.error(
      `\n${missing.length} of ${linked} heading links point at a fragment nothing spells.`,
    )
  }
  if (unresolved.length > 0) {
    console.error(`\n${unresolved.length} heading links name a markdown file that is not there.`)
  }
  if (unreadable.length > 0) {
    console.error(
      `\nCitations this check cannot read: ${unreadable.length}. The three wordings it reads ` +
        "are `DESIGN.md, **The heading**`, `DESIGN.md's **The heading**`, and anything ending " +
        'in `under `.',
    )
  }
  process.exit(1)
}

console.log(`${counted} citations and ${linked} heading links, every one of them landing.`)
