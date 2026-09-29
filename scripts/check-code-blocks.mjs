/*
 * Every ts and tsx block on the site has to compile against the workspace, as
 * CONTRIBUTING.md, **Code blocks on the site** lays out.
 *
 * The reading and the compiling are in `code-blocks.mjs`; this is the disk and
 * the report.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path/posix'
import { blocks, compiler, projects } from './code-blocks.mjs'

const PAGES = 'docs/src/content/docs'
const ROOT = 'docs/code-blocks'

const files = readdirSync(PAGES, { recursive: true })
  .filter((file) => file.endsWith('.mdx'))
  .toSorted()

const compile = compiler(ROOT)
const count = { code: 0, signature: 0, fragment: 0, failed: 0, pages: 0, unread: 0 }

const place = (block) =>
  block.heading === undefined ? 'before the first heading' : `under "${block.heading}"`

for (const file of files) {
  const page = join(PAGES, file)
  let read
  try {
    read = blocks(readFileSync(page, 'utf8'))
  } catch (error) {
    console.error(`${page}:${error.line}: ${error.message}`)
    count.unread++
    continue
  }
  if (read.length > 0) count.pages++
  for (const block of read) count[block.kind]++
  for (const project of projects(read)) {
    const found = compile(project)
    if (found.length > 0) count.failed++
    for (const { line, prelude, code, message } of found) {
      const where = prelude
        ? `in the prelude of the block ${place(project.block)}`
        : place(project.block)
      console.error(`${page}:${line}, ${where}: ${message} (TS${code})`)
    }
  }
}

if (count.failed > 0 || count.unread > 0) {
  console.error('')
  if (count.failed > 0)
    console.error(`${count.failed} of ${count.code} code blocks do not compile.`)
  if (count.unread > 0)
    console.error(`${count.unread} ${count.unread === 1 ? 'page' : 'pages'} could not be read.`)
  process.exit(1)
}

console.log(
  `${count.code} code blocks on ${count.pages} pages compile; ${count.signature} are signatures and ${count.fragment} fragments, not compiled.`,
)
