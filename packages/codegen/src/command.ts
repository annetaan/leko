import { relative } from 'node:path'
import { parseArgs } from 'node:util'

import { generate, inspect, type Options, type Report, watch } from './generate.js'
import { say, type Told, untold } from './unread.js'

const USAGE = `
leko-signals — gather the signal names a project reports and write them out.

  leko-signals [options]

  --project <path>   tsconfig.json, or the directory holding one, read with
                     every project it references. Default: cwd
  --out <path>       where to write. Default: leko-signals.d.ts beside tsconfig
  --loose            emit the vocabulary without promising it is complete, so
                     that an unknown name in awaits still compiles
  --check            write nothing, and exit 1 if the file on disk is out of
                     date. For CI
  --watch            keep writing as the project is edited
  -h, --help         this

Exits 1 when --check finds the file out of date, and 2 when it cannot run: an
option it does not know, or a tsconfig it cannot read.
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

const count = (report: Report): string => {
  const { signals } = report.result
  return signals.length === 1 ? '1 signal' : `${signals.length} signals`
}

/** Run the command on `argv` and return the exit code. */
export function run(argv: string[], io: Pick<Console, 'log' | 'warn' | 'error'>): number {
  let parsed: Parsed | null
  try {
    parsed = parseCli(argv)
  } catch (error) {
    io.error(error instanceof Error ? error.message : error)
    io.error(`\n${USAGE}`)
    return 2
  }

  if (!parsed) {
    io.log(USAGE)
    return 0
  }

  const words = {
    from: process.cwd(),
    remedy: parsed.strict === false ? null : 'run with --loose',
    elsewhere: 'pass --out somewhere that tsconfig already reads',
  }
  const tell = (report: Report, told: Told): Told => {
    const next = say(
      told,
      { out: report.out, unread: report.result.unread, included: report.included },
      words,
    )
    for (const w of next.warnings) io.warn(`\n${w}`)
    return next.told
  }

  try {
    if (parsed.watch) {
      let told = untold
      watch(parsed, (report) => {
        if (report.stale) io.log(`wrote ${here(report.out)} — ${count(report)}`)
        told = tell(report, told)
      })
      return 0
    }

    if (parsed.check) {
      const report = inspect(parsed)
      io.log(`checked ${here(report.out)} — ${count(report)}`)
      tell(report, untold)
      if (!report.stale) return 0
      io.error(`\n${here(report.out)} is out of date. Run leko-signals and commit the result.`)
      return 1
    }

    const report = generate(parsed)
    io.log(
      report.stale
        ? `wrote ${here(report.out)} — ${count(report)}`
        : `${here(report.out)} is up to date — ${count(report)}`,
    )
    tell(report, untold)
    return 0
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error))
    return 2
  }
}
