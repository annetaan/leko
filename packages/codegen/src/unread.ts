import { relative } from 'node:path'

import type { Site } from './scan.js'

/** What both the command and the Vite plugin print about the calls a scan could not read. */
export function message(
  dynamic: Site[],
  options: {
    /** The directory each call's path is printed relative to. */
    from: string
    /**
     * A verb phrase that fills the slot after "so": the command passes
     * `'run with --loose'`, the Vite plugin `'pass strict: false'`. `null` when
     * the run is already loose, so a loose run is not told to go loose.
     */
    remedy: string | null
  },
): string[] {
  if (dynamic.length === 0) return []
  const one = dynamic.length === 1
  const them = one ? 'it' : 'them'
  return [
    `${dynamic.length} reached() call${one ? '' : 's'} report${one ? 's' : ''} a name this scan cannot read.`,
    `The vocabulary is missing whatever ${one ? 'it reports' : 'they report'}, so ` +
      `${options.remedy === null ? '' : `${options.remedy} or `}name ${them} by hand:`,
    '',
    ...dynamic.map((site) => `  ${relative(options.from, site.file)}:${site.line}`),
  ]
}

const count = (sites: Site[]): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const site of sites) counts.set(site.file, (counts.get(site.file) ?? 0) + 1)
  return counts
}

/**
 * Whether the calls a scan could not read differ, counting them per file.
 *
 * An edit above a call moves its line, and a dev server that printed again on
 * every such save would be noise — the choice `emit` makes by holding names
 * rather than sites. The cost is that a printed line number goes stale when the
 * call moves. The message tells someone to fix the call or go loose; it is not
 * a live listing.
 */
export function changed(before: Site[], after: Site[]): boolean {
  const a = count(before)
  const b = count(after)
  if (a.size !== b.size) return true
  for (const [file, n] of a) if (b.get(file) !== n) return true
  return false
}

/** What a front end has already said. */
export interface Told {
  dynamic: Site[]
  outside: boolean
}

export const untold: Told = { dynamic: [], outside: false }

/** The next `Told`, and what is worth saying now; `changed` says what a change is. */
export function news(
  told: Told,
  now: { dynamic: Site[]; included: boolean | undefined },
): { told: Told; say: { outside: boolean; unread: boolean } } {
  return {
    told: {
      dynamic: now.dynamic,
      outside: now.included === undefined ? told.outside : !now.included,
    },
    say: {
      outside: now.included === false && !told.outside,
      unread: changed(told.dynamic, now.dynamic) && now.dynamic.length > 0,
    },
  }
}

/**
 * What both the command and the Vite plugin print about a report: that the
 * file is outside the project and which calls could not be read, each only
 * when `news` says it is worth saying. `scan.ts` says why the unread calls are
 * the reason a loose run exists.
 */
export function say(
  told: Told,
  now: { out: string; dynamic: Site[]; included: boolean | undefined },
  words: {
    /** The directory every path is printed relative to. */
    from: string
    /** See `message`. */
    remedy: string | null
    /**
     * A verb phrase that fills the slot after "or": how this front end moves
     * the file somewhere the tsconfig already reads.
     */
    elsewhere: string
  },
): { told: Told; warnings: string[] } {
  const { told: next, say: worth } = news(told, now)
  const warnings: string[] = []
  if (worth.outside) {
    warnings.push(
      `${relative(words.from, now.out) || now.out} is outside the project, so nothing ` +
        `compiles it and no completion\never appears. Add it to the include of\n` +
        `the tsconfig that compiles your stories, or ${words.elsewhere}.`,
    )
  }
  if (worth.unread) {
    warnings.push(message(now.dynamic, { from: words.from, remedy: words.remedy }).join('\n'))
  }
  return { told: next, warnings }
}
