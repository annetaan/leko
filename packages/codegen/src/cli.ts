#!/usr/bin/env node
import { relative } from 'node:path'
import { parseArgs } from 'node:util'

import { generate, inspect, type Options, type Report, watch } from './generate.js'
import { message, news, type Told, untold } from './unread.js'

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

/** What a run found, in one line. */
const describe = (report: Report, verb: 'wrote' | 'checked'): void => {
  const { signals } = report.result
  const names = signals.length === 1 ? '1 signal' : `${signals.length} signals`
  console.log(`${verb} ${here(report.out)} — ${names}`)
}

/**
 * Say that the file is outside the project and which calls could not be read,
 * once per run, and under `--watch` again only when `news` in `unread.ts` says
 * so. `scan.ts` says why the unread calls are the reason `--loose` exists.
 */
const tell = (report: Report, told: Told, remedy: string | null): Told => {
  const { told: next, say } = news(told, {
    dynamic: report.result.dynamic,
    included: report.included,
  })

  if (say.outside) {
    console.warn(
      `\n${here(report.out)} is outside this project, so nothing compiles it and no ` +
        `completion\never appears. Add it to the include of the tsconfig that compiles\n` +
        `your stories, or pass --out somewhere that tsconfig already reads.`,
    )
  }

  if (say.unread) {
    console.warn(`\n${message(report.result.dynamic, { from: process.cwd(), remedy }).join('\n')}`)
  }

  return next
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
    let told = untold
    watch(parsed, (report) => {
      if (report.stale) describe(report, 'wrote')
      told = tell(report, told, remedy)
    })
    return
  }

  if (parsed.check) {
    const report = inspect(parsed)
    describe(report, 'checked')
    tell(report, untold, remedy)
    if (report.stale) {
      console.error(`\n${here(report.out)} is out of date. Run leko-signals and commit the result.`)
      process.exitCode = 1
    }
    return
  }

  const report = generate(parsed)
  describe(report, 'wrote')
  tell(report, untold, remedy)
}

main()
