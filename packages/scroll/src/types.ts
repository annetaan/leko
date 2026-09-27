// The vocabulary `@annetaan/leko/scroll` publishes. What each option means and
// what it defaults to is [The API](../DESIGN.md#the-api).

/** Where a target's message goes — [The message](../DESIGN.md#the-message). */
export type LekoScrollSide = 'top' | 'bottom' | 'left' | 'right'

/** A message beside a lit target. A part left empty is not drawn. */
export interface LekoScrollMessage {
  title?: string
  body?: string
}

/** An entry of `targets` that gets lit — [What a target is](../DESIGN.md#what-a-target-is). */
export interface LekoScrollLit {
  target: string | Element
  message?: LekoScrollMessage
  side?: LekoScrollSide
  /** This target's own, over the top-level one — [Padding and radius](../DESIGN.md#padding-and-radius). */
  padding?: number
  radius?: number
  off?: false
}

/**
 * A marker: from its switch position the light is off, until the next entry's
 * — [A stretch where the light is off](../DESIGN.md#a-stretch-where-the-light-is-off).
 */
export interface LekoScrollOff {
  target: string | Element
  off: true
}

/** One entry of `targets`. */
export type LekoScrollTarget = LekoScrollLit | LekoScrollOff

/**
 * The converge `createScroll` starts —
 * [Entering converges, leaving fades](../DESIGN.md#entering-converges-leaving-fades).
 */
export interface LekoScrollIntro {
  /** In milliseconds. Left out, the converge takes the 320ms every converge takes. */
  duration?: number
}

export interface LekoScrollOptions {
  /** Lit in this order — [The array is the order](../DESIGN.md#the-array-is-the-order). */
  targets: readonly LekoScrollTarget[]
  line?: number
  fade?: number
  spacing?: number
  padding?: number
  radius?: number
  intro?: LekoScrollIntro
  /** [The whole page stays usable](../DESIGN.md#the-whole-page-stays-usable) says when it fires. */
  onChange?: (index: number | undefined) => void
}

/** What `createScroll` hands back. [Measuring](../DESIGN.md#measuring) says when to call `measure`. */
export interface LekoScroll {
  measure(): void
  destroy(): void
}
