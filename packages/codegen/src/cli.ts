#!/usr/bin/env node
import { relative } from 'node:path'

import { generate, inspect, type Options, type Report, watch } from './generate.js'

const USAGE = `
leko-signals — gather the signal names a project reports and write them out.

  leko-signals [options]

  --project <path>   tsconfig.json, or the directory holding one. Default: cwd
  --out <path>       where to write. Default: leko-signals.d.ts beside tsconfig
  --loose            emit the vocabulary without promising it is complete, so
                     that an unknown name in awaits still compiles
  --check            write nothing, and exit 1 if the file on disk is out of
                     date. For CI
  --watch            keep writing as the project is edited
  -h, --help         this
`.trim()

interface Parsed extends Options {
  check: boolean
  watch: boolean
}

const parseArgs = (argv: string[]): Parsed | null => {
  const parsed: Parsed = { check: false, watch: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = (): string => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) throw new Error(`${arg} wants a value`)
      i += 1
      return next
    }
    if (arg === '--project' || arg === '-p') parsed.project = value()
    else if (arg === '--out' || arg === '-o') parsed.out = value()
    else if (arg === '--loose') parsed.strict = false
    else if (arg === '--check') parsed.check = true
    else if (arg === '--watch' || arg === '-w') parsed.watch = true
    else if (arg === '--help' || arg === '-h') return null
    else throw new Error(`Unknown option ${arg}`)
  }
  return parsed
}

const here = (path: string): string => relative(process.cwd(), path) || path

/**
 * What a run found, in one line, plus the calls it could not read.
 *
 * The dynamic ones are said out loud every time. A vocabulary gathered from a
 * project that builds names at runtime is missing whatever those calls report,
 * and a strict `awaits` on top of it rejects steps that are right.
 */
const describe = (report: Report, wrote: boolean): void => {
  const { signals, dynamic } = report.result
  const names = signals.length === 1 ? '1 signal' : `${signals.length} signals`
  console.log(`${wrote ? 'wrote' : 'checked'} ${here(report.out)} — ${names}`)

  if (!report.included) {
    console.warn(
      `\n${here(report.out)} is outside this project, so nothing compiles it and no ` +
        `completion\never appears. Add it to the tsconfig's include, or pass --out somewhere\n` +
        `the project already reads.`,
    )
  }

  if (dynamic.length === 0) return
  const one = dynamic.length === 1
  console.warn(
    `\n${dynamic.length} reached() call${one ? '' : 's'} report${one ? 's' : ''} a name this ` +
      `scan cannot read.\nThe vocabulary is missing whatever ${one ? 'it reports' : 'they report'}` +
      `, so run with --loose or name ${one ? 'it' : 'them'} by hand:\n`,
  )
  for (const site of dynamic) console.warn(`  ${here(site.file)}:${site.line}`)
}

const main = (): void => {
  let parsed: Parsed | null
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(`\n${USAGE}`)
    process.exitCode = 2
    return
  }

  if (!parsed) {
    console.log(USAGE)
    return
  }

  if (parsed.watch) {
    watch(parsed, (report) => describe(report, true))
    return
  }

  if (parsed.check) {
    const report = inspect(parsed)
    describe(report, false)
    if (report.stale) {
      console.error(`\n${here(report.out)} is out of date. Run leko-signals and commit the result.`)
      process.exitCode = 1
    }
    return
  }

  describe(generate(parsed), true)
}

main()
