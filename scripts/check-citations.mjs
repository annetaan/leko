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
 * The finding is in `citations.mjs`; this is git, the disk and the report.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { anchors, citations, DOCS, paragraphs } from './citations.mjs'
import { passages } from './comments.mjs'

/**
 * Markdown and YAML are read whole; a source file only through its comments.
 * A citation in YAML is in a comment anyway — `ci.yml` cites the rule beside
 * the step that checks it — and reading the file whole saves teaching this a
 * second grammar.
 */
const WHOLE = /\.(md|ya?ml)$/

/**
 * Everything but `spike/`. Those pages are evidence, dated and left as they
 * stood — one of them is attached to a Chromium bug — so what they cite is a
 * record of what was written when they were, and not prose anybody maintains.
 */
const globs = ['*.ts', '*.tsx', '*.mjs', '*.md', '*.yml', '*.yaml']
const files = execFileSync('git', ['ls-files', ...globs], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file && !file.startsWith('spike/'))

const known = new Map(DOCS.map((doc) => [doc, anchors(readFileSync(doc, 'utf8'))]))

const wrong = []
let counted = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const text of WHOLE.test(file) ? paragraphs(source) : passages(source, file)) {
    for (const { doc, heading } of citations(text)) {
      counted++
      if (!known.get(doc).has(heading)) wrong.push({ file, doc, heading })
    }
  }
}

if (wrong.length > 0) {
  for (const { file, doc, heading } of wrong) {
    console.error(`${file}: ${doc} has no heading "${heading}"`)
  }
  console.error(`\n${wrong.length} of ${counted} citations point at a heading that is not there.`)
  process.exit(1)
}

console.log(`${counted} citations, every one of them landing.`)
