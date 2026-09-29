/*
 * Reading the ts and tsx blocks off a page of the site, laying each one out as
 * the files it is compiled with, and compiling it.
 *
 * `blocks` and `projects` are text in and data out, so `code-blocks.test.mjs`
 * drives them directly. `compiler` reads the project on disk and nothing else,
 * and `check-code-blocks.mjs` is left with the pages and the report.
 */
import { join, resolve } from 'node:path'
import ts from 'typescript'

import { HEADING, walk } from './citations.mjs'

/** The lines a prelude opens and closes on, each the whole of its line. */
const PRELUDE_OPEN = '{/* prelude'
const PRELUDE_CLOSE = '*/}'

/**
 * A quoted value in an info string, taken out before the words are read, so
 * `title="a signature"` marks nothing.
 */
const QUOTED = /"[^"]*"|'[^']*'/g

/**
 * A first line that names the block's file: a relative path ending in `.ts` or
 * `.tsx`, and nothing else on the line. A `..` segment is refused in `pathOf`,
 * which a pattern says less plainly.
 */
const PATH = /^\/\/ ((?:[\w.-]+\/)*[\w.-]+\.tsx?)$/

const LANGS = new Set(['ts', 'tsx'])
const KINDS = ['signature', 'fragment']

/** An error that knows the page line it is about, for the report. */
const refused = (line, message) => Object.assign(new Error(message), { line })

const pathOf = (first) => {
  const path = PATH.exec(first ?? '')?.[1]
  return path?.split('/').includes('..') ? undefined : path
}

/**
 * Every ts and tsx block on the page, in page order, as `{ line, heading, lang,
 * code, path?, kind, prelude? }`. `line` is the page line of the first code
 * line, and `prelude` is `{ line, code }` the same way.
 *
 * A prelude that is not followed by an unmarked ts or tsx block throws: its
 * code would reach no compiler, and a page that says it is checked would not
 * be.
 */
export function blocks(markdown) {
  const found = []
  let heading
  let open = null
  let pending = null
  for (const part of walk(markdown)) {
    if (part.code === undefined) {
      const { line, text } = part
      if (open !== null) {
        if (text === PRELUDE_CLOSE) {
          pending = { line: open.line, code: open.code.join('\n'), opened: open.opened }
          open = null
        } else if (text.includes('*/')) {
          throw refused(line, 'A prelude may not hold `*/`.')
        } else {
          open.code.push(text)
        }
      } else if (text === PRELUDE_OPEN) {
        if (pending !== null)
          throw refused(pending.opened, 'A prelude is followed by another prelude.')
        open = { line: line + 1, code: [], opened: line }
      } else if (pending !== null && text.trim() !== '') {
        throw refused(pending.opened, 'A prelude is followed by something other than a block.')
      } else {
        heading = HEADING.exec(text)?.[1] ?? heading
      }
      continue
    }

    if (open !== null) throw refused(open.opened, 'A prelude holds a fenced block.')
    const words = part.info.replaceAll(QUOTED, ' ').split(/\s+/)
    const lang = words[0]
    if (!LANGS.has(lang)) {
      if (pending !== null)
        throw refused(pending.opened, 'A prelude is followed by a block that is not ts or tsx.')
      continue
    }
    const kind = words.slice(1).find((word) => KINDS.includes(word)) ?? 'code'
    if (pending !== null && kind !== 'code')
      throw refused(pending.opened, `A prelude is followed by a ${kind}.`)

    const block = { line: part.line + 1, heading, lang, code: part.code.join('\n'), kind }
    const path = pathOf(part.code[0])
    if (path !== undefined) block.path = path
    if (pending !== null) block.prelude = { line: pending.line, code: pending.code }
    pending = null
    found.push(block)
  }
  if (open !== null) throw refused(open.opened, 'A prelude is never closed.')
  if (pending !== null) throw refused(pending.opened, 'A prelude is followed by no block.')
  return found
}

/**
 * The file a block is compiled as. A `.d.ts` path becomes `.ts`, because
 * `skipLibCheck` reports nothing in a declaration file and the block would
 * pass whatever it held.
 */
const compiled = (path) => path.replace(/\.d\.ts$/, '.ts')

/** A block's text with its prelude in front. */
const text = (block) =>
  block.prelude === undefined ? block.code : `${block.prelude.code}\n${block.code}`

/**
 * One project for each `code` block on the page, as `{ block, entry, files,
 * offset }`. `files` maps a path relative to the project's root to its text,
 * and holds only what the page adds to the files on disk: each earlier `code`
 * block that names a path, the latest at each path, and the block itself,
 * which is `entry`. `offset` is how many lines the prelude put in front of the
 * block.
 */
export function projects(page) {
  const found = []
  const named = new Map()
  for (const [index, block] of page.entries()) {
    if (block.kind !== 'code') continue
    const entry = compiled(block.path ?? `src/block-${index + 1}.${block.lang}`)
    const files = new Map(named)
    files.set(entry, text(block))
    const offset = block.prelude === undefined ? 0 : block.prelude.code.split('\n').length
    found.push({ block, entry, files, offset })
    if (block.path !== undefined) named.set(entry, text(block))
  }
  return found
}

/**
 * A `compile(project)` for the project on disk at `root`, which returns the
 * findings in the block, each `{ line, prelude, code, message }` at the page
 * line it is on.
 *
 * Each program is the tsconfig's own files and the page's files, read through
 * a host that answers from the page first, so a page's `src/tour.ts` stands in
 * for the one on disk. Nothing is written. The files on disk are parsed once
 * and shared between programs, which is what keeps a whole site's worth of
 * programs to a second or so.
 *
 * Only the entry's diagnostics come back, and the ones about the options and
 * the program as a whole: an earlier block is judged when it is the entry.
 */
export function compiler(root) {
  const base = resolve(root)
  const configPath = join(base, 'tsconfig.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  if (read.error !== undefined) throw new Error(message(read.error))
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, base, undefined, configPath)
  if (config.errors.length > 0) throw new Error(config.errors.map(message).join('\n'))
  const { options, fileNames } = config

  const real = ts.createCompilerHost(options)
  const cache = new Map()

  return function compile(project) {
    const virtual = new Map([...project.files].map(([path, source]) => [join(base, path), source]))
    const entry = join(base, project.entry)
    const isDirectory = (dir) => {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`
      return [...virtual.keys()].some((path) => path.startsWith(prefix))
    }

    const host = {
      ...real,
      fileExists: (file) => virtual.has(file) || real.fileExists(file),
      readFile: (file) => virtual.get(file) ?? real.readFile(file),
      directoryExists: (dir) => isDirectory(dir) || (real.directoryExists?.(dir) ?? false),
      realpath: (file) => (virtual.has(file) ? file : (real.realpath?.(file) ?? file)),
      getSourceFile(file, language, ...rest) {
        if (virtual.has(file)) return ts.createSourceFile(file, virtual.get(file), language, true)
        if (!cache.has(file)) cache.set(file, real.getSourceFile(file, language, ...rest))
        return cache.get(file)
      },
    }

    const roots = new Set([...fileNames, ...virtual.keys()])
    const program = ts.createProgram({ rootNames: [...roots], options, host })
    const source = program.getSourceFile(entry)
    const diagnostics = [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ]
    return diagnostics.map((diagnostic) => finding(project, entry, diagnostic))
  }
}

const message = (diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

/**
 * A diagnostic at the page line it is on. One with no place in the entry is
 * put at the block's first line, with the file it is in, if any, named.
 */
function finding(project, entry, diagnostic) {
  const { block, offset } = project
  const said = message(diagnostic)
  if (diagnostic.file?.fileName !== entry || diagnostic.start === undefined) {
    const where = diagnostic.file === undefined ? '' : `${diagnostic.file.fileName}: `
    return { line: block.line, prelude: false, code: diagnostic.code, message: where + said }
  }
  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
  return line < offset
    ? { line: block.prelude.line + line, prelude: true, code: diagnostic.code, message: said }
    : { line: block.line + line - offset, prelude: false, code: diagnostic.code, message: said }
}
