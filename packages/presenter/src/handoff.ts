import type { Handoff } from '@annetaan/leko-machine'

export const HANDOFF_KEY = 'leko.handoff'

/**
 * A note as kept: the handoff and the URL it was kept at — DESIGN.md, **A URL
 * is a signal the page reports**, for what "the URL" means.
 */
export interface Kept {
  handoff: Handoff
  from: string
}

export const encode = (kept: Kept): string =>
  JSON.stringify({
    from: kept.from,
    source: kept.handoff.url.source,
    flags: kept.handoff.url.flags,
    into: kept.handoff.into,
  })

/**
 * The note is untrusted text: another project on the same origin, or an older
 * build, can have written the key — DESIGN.md, **A page load ends the story,
 * and hands it on** (its *One key, one origin* bullet).
 */
export const decode = (raw: string | null): Kept | undefined => {
  if (raw === null) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined

  const { from, source, flags, into } = parsed as Record<string, unknown>
  if (
    typeof from !== 'string' ||
    typeof source !== 'string' ||
    typeof flags !== 'string' ||
    typeof into !== 'string'
  ) {
    return undefined
  }

  try {
    void new RegExp(source, flags)
  } catch {
    return undefined
  }

  return { from, handoff: { url: { source, flags }, into } }
}
