import type { Plugin } from 'vite'

import { generate, type Options, watch } from './generate.js'

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
 */
export function lekoSignals(options: Options = {}): Plugin {
  let stop: (() => void) | undefined

  return {
    name: 'leko-signals',

    configureServer(server) {
      stop?.()
      stop = watch(options, (report) => {
        if (report.included) return
        server.config.logger.warn(
          `[leko-signals] ${report.out} is outside the project, so nothing compiles it ` +
            `and no completion ever appears. Add it to the tsconfig's include.`,
        )
      })
    },

    buildStart() {
      // `configureServer` never runs for a build, and a build should not be the
      // one place the vocabulary is allowed to be stale.
      if (!stop) generate(options)
    },

    closeBundle() {
      stop?.()
      stop = undefined
    },
  }
}

export default lekoSignals
