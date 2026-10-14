import type { Plugin, ResolvedConfig } from 'vite'

import { generate, type Options, type Report, watch } from './generate.js'
import { message, news, untold } from './unread.js'

/**
 * Keep `leko-signals.d.ts` current while `vite dev` runs, and write it once
 * before a build.
 *
 * With this in place nobody runs anything. An engineer writes
 * `leko.reached('order-saved')`, saves, and the name is offered on `awaits` in
 * the story they write next. That is the whole point of the generator, and a
 * command somebody has to remember to run is not it.
 *
 * The watch is the TypeScript compiler's own, so an edit costs the files that
 * changed rather than the project. Vite is not asked to reload anything: the
 * file that changed is a declaration file, which no bundle contains and no
 * browser ever sees.
 *
 * Through Vite's logger it prints the `reached()` calls the scan could not
 * read, and an `out` the project does not include, when the dev server starts
 * or a build begins, and again only when they change — `news` in `unread.ts`
 * decides which.
 */
export function lekoSignals(options: Options = {}): Plugin {
  let stop: (() => void) | undefined
  let config: ResolvedConfig | undefined
  let told = untold
  const remedy = options.strict === false ? null : 'pass strict: false'

  const tell = (report: Report): void => {
    if (!config) return
    const { told: next, say } = news(told, {
      dynamic: report.result.dynamic,
      included: report.included,
    })
    told = next
    if (say.outside) {
      config.logger.warn(
        `[leko-signals] ${report.out} is outside the project, so nothing compiles it ` +
          `and no completion ever appears. Add it to the tsconfig's include.`,
      )
    }
    if (say.unread) {
      config.logger.warn(
        `[leko-signals] ${message(report.result.dynamic, { from: config.root, remedy }).join('\n')}`,
      )
    }
  }

  return {
    name: 'leko-signals',

    configResolved(resolved) {
      config = resolved
    },

    configureServer() {
      stop?.()
      stop = watch(options, tell)
    },

    buildStart() {
      // `configureServer` never runs for a build, and a build should not be the
      // one place the vocabulary is allowed to be stale.
      if (!stop) tell(generate(options))
    },

    closeBundle() {
      stop?.()
      stop = undefined
    },
  }
}

export default lekoSignals
