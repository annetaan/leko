import { type Hole, holeOf, type Layout, paddingOf, radiusOf, tuningOf } from './geometry.js'
import { boxOf, type Page, readPage, resolve } from './page.js'
import { create, type Event, type Outcome, reduce, type State } from './plan.js'
import { Scrim } from './scrim.js'
import type { LekoScroll, LekoScrollOptions } from './types.js'

/**
 * Light `options.targets` as the reader scrolls. The shell: it measures,
 * listens and carries out what the plan answers, and decides nothing —
 * [The core and the shell](../DESIGN.md#the-core-and-the-shell).
 */
export function createScroll(options: LekoScrollOptions): LekoScroll {
  // Copied from `prefersReducedMotion` in `packages/spotlight/src/motion.ts` —
  // [Reduced motion](../DESIGN.md#reduced-motion).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    console.info('Leko Scroll: prefers-reduced-motion is set, so nothing is drawn.')
    return { measure() {}, destroy() {} }
  }

  const { targets } = options
  const tuning = tuningOf(options)
  const scrim = new Scrim({ onArrive: () => dispatch({ type: 'arrived' }) })
  const warned = new Set<number>()
  let state: State | undefined
  let page: Page
  /** By index in `targets`, in page coordinates. */
  let holes: (Hole | undefined)[] = []
  let alive = true

  function measure(): void {
    if (!alive) return
    // Collapsed first, because the root is part of what the page's size is read
    // from, and left at its old size it would hold the page at least that big.
    // Put back at `left: 0; top: 0` with it, so the origin is read from there.
    scrim.resize(0, 0)
    page = readPage(scrim.root)
    const boxes = targets.map(({ target }, index) => {
      const el = resolve(target)
      if (el === undefined) {
        if (!warned.has(index)) {
          warned.add(index)
          console.warn(
            `Leko Scroll: targets[${index}] matches nothing with a box, and is skipped.`,
            target,
          )
        }
        return undefined
      }
      return boxOf(el, page)
    })
    holes = targets.map((entry, index) => {
      const box = boxes[index]
      return box && entry.off !== true
        ? holeOf(box, paddingOf(entry, options), radiusOf(entry, options))
        : undefined
    })
    const layout: Layout = {
      viewportHeight: page.viewportHeight,
      pageHeight: page.pageHeight,
      boxes,
      off: targets.map((entry) => entry.off === true),
    }
    // [The scrim rides the page](../DESIGN.md#the-scrim-rides-the-page) says
    // why the root is moved by the origin.
    scrim.resize(page.pageWidth, page.pageHeight, -page.origin.x, -page.origin.y)
    perform(
      state === undefined
        ? create(tuning, layout, page.scrollY)
        : reduce(state, { type: 'measured', layout, scrollY: page.scrollY }),
    )
  }

  function dispatch(event: Event): void {
    if (alive && state !== undefined) perform(reduce(state, event))
  }

  function perform(outcome: Outcome): void {
    state = outcome.state
    const { viewportWidth, viewportHeight } = page
    // The plan never names an index with no box, nor an off entry's, so every
    // `holes[…]!` below has one, and every entry revealed is a lit one.
    for (const effect of outcome.effects) {
      switch (effect.effect) {
        case 'opacity':
          scrim.opacity(effect.value)
          break
        case 'converge':
          scrim.converge(holes[effect.to]!, {
            x: page.scrollX,
            y: page.scrollY,
            width: viewportWidth,
            height: viewportHeight,
          })
          break
        case 'morph':
          scrim.morph(holes[effect.to]!)
          break
        case 'place':
          scrim.place(holes[effect.on]!, viewportWidth)
          break
        case 'reveal': {
          const entry = targets[effect.on]!
          if (entry.off !== true) scrim.reveal(entry.message, entry.side ?? 'bottom', viewportWidth)
          break
        }
        case 'out':
          scrim.out()
          break
        case 'notify':
          options.onChange?.(effect.index)
          break
      }
    }
  }

  // Passive, and `scrollY` is the one thing read —
  // [The scrim rides the page](../DESIGN.md#the-scrim-rides-the-page).
  const onScroll = (): void => {
    page.scrollY = window.scrollY
    dispatch({ type: 'scroll', scrollY: page.scrollY })
  }

  // The moments [Measuring](../DESIGN.md#measuring) names.
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', measure)
  window.addEventListener('load', measure)
  void document.fonts.ready.then(measure)
  measure()

  return {
    measure,
    destroy() {
      if (!alive) return
      alive = false
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      window.removeEventListener('load', measure)
      scrim.destroy()
    },
  }
}
