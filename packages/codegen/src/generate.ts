import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { classify, load, type Session } from './compiler.js'
import { emit } from './emit.js'
import type { ScanResult } from './scan.js'
import { rootsOf, watchTree } from './watcher.js'

export interface Options {
  /**
   * A `tsconfig.json`, or the directory holding one, read with every project it
   * references, transitively. Defaults to the cwd.
   */
  project?: string
  /** Defaults to `leko-signals.d.ts` beside the tsconfig. */
  out?: string
  /** See {@link import('./emit.js').EmitOptions.strict}. Defaults to `true`. */
  strict?: boolean
}

export interface Report {
  out: string
  content: string
  /**
   * Whether what was on disk before this run differs from what the scan
   * produced, so a report from `generate` or `watch` that says so is one that
   * wrote.
   */
  stale: boolean
  /**
   * Whether the project actually reads the file that was written.
   *
   * A declaration file outside the `include` of every project the run reads is
   * compiled by nobody. The augmentation never applies, no completion appears, and there is
   * no error anywhere to explain it, so this is worth saying out loud.
   *
   * `undefined` when the file is not on disk, so no project could have read it
   * yet. Only `inspect` gives `undefined`: `generate` and `watch` ask again
   * after writing, so they always give a boolean.
   */
  included: boolean | undefined
  result: ScanResult
}

interface Resolved {
  config: string
  out: string
}

const locate = (options: Options): Resolved => {
  const given = resolve(options.project ?? process.cwd())
  const config = given.endsWith('.json') ? given : resolve(given, 'tsconfig.json')
  const out = options.out
    ? isAbsolute(options.out)
      ? options.out
      : resolve(process.cwd(), options.out)
    : resolve(dirname(config), 'leko-signals.d.ts')
  return { config, out }
}

// TypeScript's `sys` decides case sensitivity the same way: by whether this
// module's own path, with its letter case swapped, exists.
const here = fileURLToPath(import.meta.url)
const swapped = here.replace(/\w/g, (c) =>
  c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
)
const caseSensitive = here === swapped || !existsSync(swapped)

const fold = (path: string): string => (caseSensitive ? path : path.toLowerCase())

// A project whose only file is the declaration file compiles it for nobody.
const reads = (fileNames: readonly string[], out: string): boolean =>
  fileNames.length > 1 && fileNames.some((name) => fold(resolve(name)) === fold(out))

// Git with `core.autocrlf` checks the file out with CRLF line endings.
const compare = (out: string, content: string): boolean => {
  try {
    return readFileSync(out, 'utf8').replaceAll('\r\n', '\n') !== content
  } catch {
    return true
  }
}

const included = (session: Session, out: string): boolean =>
  session.projects().some(({ roots }) => reads(roots, out))

const write = (answer: Report): void => {
  mkdirSync(dirname(answer.out), { recursive: true })
  writeFileSync(answer.out, answer.content, 'utf8')
}

const report = (
  out: string,
  result: ScanResult,
  strict: boolean,
  inside: boolean | undefined,
): Report => {
  const content = emit(result, { strict })
  return { out, content, stale: compare(out, content), included: inside, result }
}

/**
 * Scan the project and say what the declaration file should hold, without
 * touching the disk. This is what `--check` runs.
 */
export function inspect(options: Options = {}): Report {
  const { config, out } = locate(options)
  const session = load().open(config)
  try {
    return report(
      out,
      session.scan(),
      options.strict ?? true,
      existsSync(out) ? included(session, out) : undefined,
    )
  } finally {
    session.close()
  }
}

/**
 * Scan the project and write the declaration file.
 *
 * Nothing is written when the content has not changed. That is not an
 * optimisation. A watcher that fires on the file it just caused to be written
 * never stops.
 */
export function generate(options: Options = {}): Report {
  const { config, out } = locate(options)
  const session = load().open(config)
  try {
    const answer = report(
      out,
      session.scan(),
      options.strict ?? true,
      existsSync(out) ? included(session, out) : undefined,
    )
    if (!answer.stale) return answer
    write(answer)
    // Asked again now the file exists. A first run always writes something the
    // first program could not have seen.
    session.update(classify(out, true, new Set(session.files())))
    return { ...answer, included: included(session, out) }
  } finally {
    session.close()
  }
}

/**
 * Keep the declaration file up to date while the project is being edited.
 *
 * `onReport` runs after every scan, whether or not it wrote, and `stale` says
 * which. Edits reach the compiler as the files that changed, so a keystroke
 * costs those rather than the whole project. Returns the function that stops
 * it.
 *
 * The set of projects is read once at start, so a change to `references` wants
 * a restart.
 */
export function watch(options: Options = {}, onReport?: (report: Report) => void): () => void {
  const { config, out } = locate(options)
  const strict = options.strict ?? true
  const session = load().open(config)
  const configs = session.projects().map((project) => project.config)
  let known: ReadonlySet<string> = new Set(session.files())
  let targeted = ''

  const settle = (): void => {
    const answer = report(out, session.scan(), strict, included(session, out))
    if (!answer.stale) {
      onReport?.(answer)
      return
    }
    write(answer)
    session.update(classify(out, true, known))
    known = new Set(session.files())
    onReport?.({ ...answer, included: included(session, out) })
  }

  const retarget = (): void => {
    const dirs = rootsOf([...configs, ...known])
    const key = dirs.join('\n')
    if (key === targeted) return
    targeted = key
    watcher.watch(dirs)
  }

  const watcher = watchTree((path) => {
    session.update(classify(path, existsSync(path), known))
    known = new Set(session.files())
    retarget()
    settle()
  })

  try {
    retarget()
    settle()
  } catch (error) {
    watcher.close()
    session.close()
    throw error
  }
  return () => {
    watcher.close()
    session.close()
  }
}
