/*
 * Which of this file's comments are already written down somewhere else.
 *
 * Keeping a comment means claiming its fact has no other home, and that claim
 * is wrong far more often than it feels. One rule reaches this file, the
 * document that argues it and the sandbox case a viewer reads it in, and each
 * copy is written by somebody sure it was not written down yet. So the claim is
 * checked rather than remembered.
 *
 * Runs of eight words are what it reports. Shorter and this repository's own
 * vocabulary — a target that is not on the page — matches everywhere; longer
 * and a paragraph reworded in the middle slips through. A hit is not a verdict:
 * it says the same sentence exists twice and leaves which copy goes to whoever
 * is reading, under the table in DESIGN.md's **Where things are written down**.
 *
 * Usage: node .claude/skills/trim-comments/overlap.mjs <file> [words]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { prose } from '../../../scripts/comments.mjs'

const [target, size = '8'] = process.argv.slice(2)
if (!target) {
  console.error('name the file to check')
  process.exit(2)
}
const n = Number(size)

const grams = (text) => {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? []
  const out = new Set()
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '))
  return out
}

/** Longer runs read as one quotation; overlapping shingles read as many. */
const merge = (hits) => {
  const runs = []
  for (const hit of hits.toSorted()) {
    const head = hit.split(' ').slice(0, -1).join(' ')
    const tail = hit.split(' ').at(-1)
    const grown = runs.findIndex((run) => run.endsWith(head))
    if (grown === -1) runs.push(hit)
    else runs[grown] += ` ${tail}`
  }
  return runs
}

const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx', '*.md'], { encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && file !== target && !file.startsWith('spike/'))

const wanted = grams(prose(readFileSync(target, 'utf8'), target))
const seen = new Set()
let total = 0

for (const file of tracked) {
  const source = readFileSync(file, 'utf8')
  const here = grams(file.endsWith('.md') ? source : prose(source, file))
  const hits = [...wanted].filter((g) => here.has(g))
  const runs = merge(hits).filter((run) => !seen.has(run))
  if (runs.length === 0) continue
  for (const run of runs) seen.add(run)
  total += runs.length
  console.log(`--- ${file} ---`)
  for (const run of runs) console.log(`    ${run}`)
}

console.log(`\n${total} passage${total === 1 ? '' : 's'} of ${n} words or more, written twice.`)
