#!/usr/bin/env node
import { relative } from 'node:path'
import { parseArgs } from 'node:util'

import { generate, inspect, type Options, type Report, watch } from './generate.js'
import { message } from './unread.js'

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

const parseCli = (argv: string[]): Parsed | null => {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string', short: 'p' },
      out: { type: 'string', short: 'o' },
      loose: { type: 'boolean' },
      check: { type: 'boolean' },
      watch: { type: 'boolean', short: 'w' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) return null
  return {
    project: values.project,
    out: values.out,
    ...(values.loose ? { strict: false } : {}),
    check: values.check ?? false,
    watch: values.watch ?? false,
  }
}

const here = (path: string): string => relative(process.cwd(), path) || path

/**
 * What a run found, in one line, plus the calls it could not read.
 *
 * The dynamic ones are said out loud every time — `scan.ts` says why they are
 * the reason `--loose` exists.
 */
const describe = (report: Report, wrote: boolean, remedy: string | null): void => {
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

  const lines = message(dynamic, { from: process.cwd(), remedy })
  if (lines.length > 0) console.warn(`\n${lines.join('\n')}`)
}

const main = (): void => {
  let parsed: Parsed | null
  try {
    parsed = parseCli(process.argv.slice(2))
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

  const remedy = parsed.strict === false ? null : 'run with --loose'

  if (parsed.watch) {
    watch(parsed, (report) => {
      if (report.stale) describe(report, true, remedy)
    })
    return
  }

  if (parsed.check) {
    const report = inspect(parsed)
    describe(report, false, remedy)
    if (report.stale) {
      console.error(`\n${here(report.out)} is out of date. Run leko-signals and commit the result.`)
      process.exitCode = 1
    }
    return
  }

  describe(generate(parsed), true, remedy)
}

main()
