import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import ts from 'typescript'

import { emit } from './emit.js'
import { scan, type ScanResult } from './scan.js'

export interface Options {
  /** A `tsconfig.json`, or the directory holding one. Defaults to the cwd. */
  project?: string
  /** Defaults to `leko-signals.d.ts` beside the tsconfig. */
  out?: string
  /** See {@link import('./emit.js').EmitOptions.strict}. Defaults to `true`. */
  strict?: boolean
}

export interface Report {
  out: string
  content: string
  /** Whether what is on disk differs from what the scan produced. */
  stale: boolean
  /**
   * Whether the project actually reads the file that was written.
   *
   * A declaration file outside the `include` of the tsconfig is compiled by
   * nobody. The augmentation never applies, no completion appears, and there is
   * no error anywhere to explain it, so this is worth saying out loud.
   */
  included: boolean
  result: ScanResult
}

interface Resolved {
  config: string
  out: string
  root: string
}

const locate = (options: Options): Resolved => {
  const given = resolve(options.project ?? process.cwd())
  const config = given.endsWith('.json') ? given : resolve(given, 'tsconfig.json')
  const root = dirname(config)
  const out = options.out
    ? isAbsolute(options.out)
      ? options.out
      : resolve(process.cwd(), options.out)
    : resolve(root, 'leko-signals.d.ts')
  return { config, out, root }
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

const compare = (out: string, content: string): boolean => {
  try {
    return readFileSync(out, 'utf8') !== content
  } catch {
    return true
  }
}

/** Whether the tsconfig, read again from disk, now takes in `out`. */
const covers = (config: string, out: string): boolean => {
  try {
    return parse(config).fileNames.some((name) => resolve(name) === out)
  } catch {
    return false
  }
}

const report = (
  out: string,
  root: string,
  result: ScanResult,
  strict: boolean,
  included: boolean,
): Report => {
  const content = emit(result, { strict, root })
  return { out, content, stale: compare(out, content), included, result }
}

/**
 * Scan the project and say what the declaration file should hold, without
 * touching the disk. This is what `--check` runs.
 */
export function inspect(options: Options = {}): Report {
  const { config, out, root } = locate(options)
  const parsed = parse(config)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const included = parsed.fileNames.some((name) => resolve(name) === out)
  return report(out, root, scan(program, ts), options.strict ?? true, included)
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
 * `ts.createWatchProgram` reuses the program between edits, so a keystroke costs
 * the files that changed rather than the whole project. Returns the function
 * that stops it.
 */
export function watch(options: Options = {}, onWrite?: (report: Report) => void): () => void {
  const { config, out, root } = locate(options)
  const strict = options.strict ?? true
  const host = ts.createWatchCompilerHost(
    config,
    { noEmit: true },
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    // Diagnostics belong to whatever is already compiling this project. A
    // generator that reprints its errors is noise in two places.
    () => {},
    () => {},
  )
  host.afterProgramCreate = (builder) => {
    const program = builder.getProgram()
    const answer = report(out, root, scan(program, ts), strict, true)
    if (!answer.stale) return
    mkdirSync(dirname(answer.out), { recursive: true })
    writeFileSync(answer.out, answer.content, 'utf8')
    // Asked once the file is on disk. The first program of a run was built
    // before there was anything to take in, and reporting from that one calls
    // every first run a mistake.
    onWrite?.({ ...answer, included: covers(config, out) })
  }
  const watching = ts.createWatchProgram(host)
  return () => watching.close()
}
