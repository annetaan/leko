/*
 * Did the trim touch the code? — asked of the working tree against HEAD.
 *
 * The one check that has to pass before a trimmed file is worth reading. A
 * comment cannot break a build, so a green typecheck says nothing about
 * whether a line of code went with the paragraph above it.
 *
 * Usage: node .claude/skills/trim-comments/code-identity.mjs <file…>
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { strip } from '../../../scripts/comments.mjs'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('name at least one file')
  process.exit(2)
}

let moved = 0
for (const file of files) {
  const head = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' })
  const before = strip(head, file)
  const after = strip(readFileSync(file, 'utf8'), file)
  if (before === after) {
    console.log(`${file}: code identical`)
    continue
  }
  moved++
  const b = before.split('\n')
  const a = after.split('\n')
  for (let i = 0; i < Math.max(b.length, a.length); i++) {
    if (b[i] !== a[i]) {
      console.error(`${file}: code changed, first at stripped line ${i + 1}`)
      console.error(`  HEAD: ${b[i] ?? '(end of file)'}`)
      console.error(`  now : ${a[i] ?? '(end of file)'}`)
      break
    }
  }
}
process.exit(moved > 0 ? 1 : 0)
