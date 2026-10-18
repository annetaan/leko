import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import ts from 'typescript'

import { emit } from './emit.js'
import { scan, type ScanResult } from './scan.js'

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

const parse = (config: string): ts.ParsedCommandLine => {
  const parsed = ts.getParsedCommandLineOfConfigFile(config, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    },
  } as ts.ParseConfigFileHost)
  if (!parsed) throw new Error(`Could not read ${config}`)
  return parsed
}

/** The tsconfig and every project it references, depth-first, each read once. */
const projects = (config: string): { config: string; parsed: ts.ParsedCommandLine }[] => {
  const visited = new Set<string>()
  const read: { config: string; parsed: ts.ParsedCommandLine }[] = []
  const walk = (path: string): void => {
    if (visited.has(path)) return
    visited.add(path)
    const parsed = parse(path)
    read.push({ config: path, parsed })
    for (const reference of parsed.projectReferences ?? []) {
      walk(resolve(ts.resolveProjectReferencePath(reference)))
    }
  }
  walk(config)
  return read
}

const fold = (path: string): string =>
  ts.sys.useCaseSensitiveFileNames ? path : path.toLowerCase()

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

/** Whether a project the tsconfig reaches, read again from disk, now takes in `out`. */
const covers = (config: string, out: string): boolean => {
  try {
    return projects(config).some(({ parsed }) => reads(parsed.fileNames, out))
  } catch {
    return false
  }
}

const report = (
  out: string,
  result: ScanResult,
  strict: boolean,
  included: boolean | undefined,
): Report => {
  const content = emit(result, { strict })
  return { out, content, stale: compare(out, content), included, result }
}

/**
 * Scan the project and say what the declaration file should hold, without
 * touching the disk. This is what `--check` runs.
 */
export function inspect(options: Options = {}): Report {
  const { config, out } = locate(options)
  const read = projects(config)
  const programs = read.map(({ parsed }) => ts.createProgram(parsed.fileNames, parsed.options))
  const included = existsSync(out)
    ? read.some(({ parsed }) => reads(parsed.fileNames, out))
    : undefined
  return report(out, scan(programs, ts), options.strict ?? true, included)
}

/**
 * Scan the project and write the declaration file.
 *
 * Nothing is written when the content has not changed. That is not an
 * optimisation. A watcher that fires on the file it just caused to be written
 * never stops.
 */
export function generate(options: Options = {}): Report {
  const answer = inspect(options)
  if (!answer.stale) return answer
  mkdirSync(dirname(answer.out), { recursive: true })
  writeFileSync(answer.out, answer.content, 'utf8')
  // Asked again now the file exists. A first run always writes something the
  // earlier parse could not have seen.
  const { config } = locate(options)
  return { ...answer, included: covers(config, answer.out) }
}

/**
 * Keep the declaration file up to date while the project is being edited.
 *
 * `onReport` runs after every program, whether or not it wrote, and `stale`
 * says which. `ts.createWatchProgram` reuses the program between edits, so a
 * keystroke costs the files that changed rather than the whole project. Returns
 * the function that stops it.
 *
 * The set of projects is read once at start, so a change to `references` wants
 * a restart. TypeScript's solution builder walks references itself and is not
 * used: it emits and writes `.tsbuildinfo` into the user's project, and it
 * creates no program for a project it judges up to date, so nothing would be
 * scanned there at start.
 */
export function watch(options: Options = {}, onReport?: (report: Report) => void): () => void {
  const { config, out } = locate(options)
  const strict = options.strict ?? true
  const read = projects(config)
  const latest = new Map<string, ts.Program>()
  let ready = false
  const settle = (): void => {
    const programs = read.flatMap(({ config: c }) => latest.get(c) ?? [])
    // A program that writes nothing was built with the file already on disk, so
    // its root names can be trusted without parsing the tsconfig on every save.
    const included = programs.some((program) => reads(program.getRootFileNames(), out))
    const answer = report(out, scan(programs, ts), strict, included)
    if (!answer.stale) {
      onReport?.(answer)
      return
    }
    mkdirSync(dirname(answer.out), { recursive: true })
    writeFileSync(answer.out, answer.content, 'utf8')
    // Asked once the file is on disk. The first program of a run was built
    // before there was anything to take in, and reporting from that one calls
    // every first run a mistake.
    onReport?.({ ...answer, included: covers(config, out) })
  }
  const watching: ts.WatchOfConfigFile<ts.SemanticDiagnosticsBuilderProgram>[] = []
  for (const entry of read) {
    const host = ts.createWatchCompilerHost(
      entry.config,
      { noEmit: true },
      ts.sys,
      ts.createSemanticDiagnosticsBuilderProgram,
      // Diagnostics belong to whatever is already compiling this project. A
      // generator that reprints its errors is noise in two places.
      () => {},
      () => {},
    )
    // A watch program reads a referenced project through its output `.d.ts`,
    // which a project that emits nothing never has, so every import across a
    // reference would resolve to nothing. `createProgram` in `inspect` is given
    // no references and reads the sources already.
    host.useSourceOfProjectReferenceRedirect = () => true
    host.afterProgramCreate = (builder) => {
      latest.set(entry.config, builder.getProgram())
      if (ready) settle()
    }
    // The first program arrives inside this call, so settling waits for the
    // last watcher and a run reports once at start.
    watching.push(ts.createWatchProgram(host))
  }
  ready = true
  settle()
  return () => {
    for (const w of watching) w.close()
  }
}
