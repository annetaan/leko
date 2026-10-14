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
