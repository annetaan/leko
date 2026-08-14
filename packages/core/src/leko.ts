import { type Cutout, grow, type Rect, resolveTarget, resolveTargets, union } from './geometry.js'
import { Message } from './message.js'
import { findScrollContainer, paddingBoxWithin, rectWithin, Scrim } from './scrim.js'
import type { ErrorUtils, LekoOptions, LekoState, LekoStep, LekoTarget } from './types.js'

const DEFAULTS = { padding: 8, radius: 8, duration: 320 } as const

const asArray = (value: LekoTarget | LekoTarget[]): LekoTarget[] =>
  Array.isArray(value) ? value : [value]

interface Resolved {
  /** The element `validate` is given: the first of `target`. */
  action: HTMLElement
  cutouts: Cutout[]
}

export class Leko {
  private readonly options: LekoOptions
  /**
   * One scrim per scrolling ancestor, innermost first, always ending with the
   * document. Only the innermost carries the step's cutouts; each outer one is
   * cut to the shape of the scroller inside it, so the layers together dim the
   * whole page while each still scrolls with its own content.
   */
  private layers: Scrim[] = []
  /**
   * Outlives the scrims on purpose. A step in a different scroller rebuilds the
   * stack of scrims, but the message is anchored to the target rather than
   * mounted in any of them, so it has nothing to rebuild.
   */
  private message: Message | undefined
  private index = 0
  private currentState: LekoState = 'idle'
  private onViewportChange: (() => void) | undefined
  private watcher: MutationObserver | undefined

  constructor(options: LekoOptions) {
    this.options = options
  }

  get state(): LekoState {
    return this.currentState
  }

  /** The step being shown, or `undefined` while idle. */
  get step(): LekoStep | undefined {
    return this.currentState === 'idle' ? undefined : this.options.steps[this.index]
  }

  start(at: string | number = 0): void {
    const index = typeof at === 'string' ? this.options.steps.findIndex((s) => s.id === at) : at
    if (index < 0 || index >= this.options.steps.length) return
    this.index = index
    this.currentState = 'running'
    this.show(false)
  }

  /**
   * Advance, if the step says the user actually succeeded.
   *
   * A no-op while idle, so callers never have to guard. It is *not* a no-op mid
   * morph: silently dropping a call would be Leko deciding the application did
   * not mean it, which is the guessing this library exists to avoid.
   */
  nextStep(): void {
    if (this.currentState === 'idle') return
    const step = this.options.steps[this.index]
    if (!step) return

    if (step.validate) {
      const action = resolveTarget(asArray(step.target)[0]!)
      if (!action) return this.lose(step)
      if (!step.validate(action)) {
        step.onValidationError?.(action, this.errorUtils(action))
        return
      }
    }

    if (this.index >= this.options.steps.length - 1) {
      this.stop()
      return
    }
    this.index += 1
    this.show(true)
  }

  /** Step back. Never validates: going back is not a claim of success. */
  prevStep(): void {
    if (this.currentState === 'idle' || this.index === 0) return
    this.index -= 1
    this.show(true)
  }

  stop(): void {
    this.currentState = 'idle'
    this.index = 0
    this.teardown()
    this.message?.destroy()
    this.message = undefined
  }

  private errorUtils(action: HTMLElement): ErrorUtils {
    return {
      shake: () => this.layers[0]?.shake(),
      setMessage: (message) => {
        const step = this.options.steps[this.index]
        if (!step) return
        step.message = message
        // Nothing has moved, so a visible message only changes its words.
        // Re-placing it would jump the box out from under someone in the middle
        // of reading why they were stopped. A step that had no message until now
        // has nowhere to jump from, so that one is placed properly.
        if (this.message?.visible) this.message.setText(message)
        else this.say(step, action)
      },
    }
  }

  /**
   * The step's cutouts, in whatever space `measure` reports in.
   *
   * The scrim wants them in its own content coordinates; the message wants the
   * same shapes in viewport coordinates, to work out which side of them has room
   * on screen. Same geometry, two readers, so the space is the parameter.
   */
  private resolve(step: LekoStep, measure: (el: HTMLElement) => Rect): Resolved | null {
    const targets = resolveTargets(asArray(step.target))
    const action = targets[0]
    if (!action) return null

    const padding = step.padding ?? this.options.padding ?? DEFAULTS.padding
    const radius = step.radius ?? this.options.radius ?? DEFAULTS.radius

    // The action target is one cutout — the union of however many elements were
    // named. Everything in `related` stays separate, because the union of two
    // distant regions covers everything between them.
    const box = union(targets.map(measure))
    if (!box) return null
    const cutouts: Cutout[] = [{ ...grow(box, padding), radius }]

    for (const el of resolveTargets(step.related ?? [])) {
      cutouts.push({ ...grow(measure(el), padding), radius })
    }
    return { action, cutouts }
  }

  /**
   * Put the message beside the step's cutouts.
   *
   * Measured in viewport coordinates and only at step boundaries: the side is
   * chosen from what is on screen now, and the browser holds the message there
   * through every scroll that follows.
   */
  private say(step: LekoStep, action: HTMLElement): void {
    if (!step.message) {
      this.message?.hide()
      return
    }
    this.message ??= new Message()
    const onScreen = this.resolve(step, (el) => el.getBoundingClientRect())
    const gap = step.padding ?? this.options.padding ?? DEFAULTS.padding
    this.message.show(step.message, action, onScreen?.cutouts ?? [], gap)
  }

  /**
   * Every scrolling ancestor of `el`, innermost first, always ending in `null`
   * for the document itself.
   */
  private static chainOf(el: HTMLElement): (HTMLElement | null)[] {
    const container = findScrollContainer(el)
    return container ? [container, ...Leko.chainOf(container)] : [null]
  }

  /**
   * Put the cutouts where they belong, right now and without animating.
   *
   * Used when the surface moved under the tour rather than the tour moving —
   * a resize, say. Replaying the opening there would blow the cutout back up to
   * the size of the page and converge again, so for a moment almost nothing
   * would be dimmed.
   */
  private place(): void {
    const step = this.options.steps[this.index]
    if (this.currentState === 'idle' || !step) return
    const inner = this.layers[0]
    if (!inner) return
    for (const layer of this.layers) layer.resize()
    const action = resolveTarget(asArray(step.target)[0]!)
    this.cutOuterLayers(Leko.chainOf(action ?? document.body))
    const resolved = this.resolve(step, (el) => rectWithin(el, inner.container))
    if (resolved) inner.set(resolved.cutouts)
    // The message needs no help to follow a scroll, but a resize can leave the
    // side it was put on without room, so that choice is made again.
    if (action) this.say(step, action)
  }

  /** Each outer layer is cut to the scroller nested inside it. */
  private cutOuterLayers(chain: (HTMLElement | null)[]): void {
    this.layers.slice(1).forEach((layer, i) => {
      const nested = chain[i]
      if (!nested) return
      // Match the scroller's own rounding, or its corners show through the hole.
      const radius = parseFloat(getComputedStyle(nested).borderTopLeftRadius) || 0
      layer.set([{ ...paddingBoxWithin(nested, layer.container), radius }])
    })
  }

  private show(animate: boolean): void {
    const step = this.options.steps[this.index]
    if (!step) return this.stop()

    const action = resolveTarget(asArray(step.target)[0]!)
    if (!action) return this.lose(step)

    const chain = Leko.chainOf(action)
    // A step in a different set of scrollers needs a different stack of scrims.
    // Rebuilding is not a morph, so it happens outright rather than half-way.
    const sameStack =
      this.layers.length === chain.length && this.layers.every((l, i) => l.container === chain[i])
    if (!sameStack) this.teardown()

    if (this.layers.length === 0) {
      this.layers = chain.map((container) => new Scrim(container))
      this.watchViewport()
    }

    const container = chain[0] ?? null
    const resolved = this.resolve(step, (el) => rectWithin(el, container))
    if (!resolved) return this.lose(step)

    const inner = this.layers[0]
    if (!inner) return this.lose(step)

    // These holes move only when layout does, never when something scrolls.
    this.cutOuterLayers(chain)

    if (!animate) {
      // Open from a hole larger than the surface, so the scrim converges inward
      // rather than appearing already cut.
      const w = inner.element.offsetWidth
      const h = inner.element.offsetHeight
      const m = Math.max(w, h)
      inner.set([{ x: -m, y: -m, width: w + m * 2, height: h + m * 2, radius: 0 }])
    }

    this.watchTarget(step, action)

    // Gone for the duration of the morph, and placed again once the cutout has
    // arrived. There is no honest place for it while the hole is on its way:
    // the side with room is a fact about where the cutout ends up.
    this.message?.hide()

    const morphing = inner.morph(resolved.cutouts, this.options.duration ?? DEFAULTS.duration)
    if (!morphing) {
      this.currentState = 'running'
      this.say(step, action)
      return
    }
    this.currentState = 'transitioning'
    // Only the morph that actually finished may call the step settled. Starting
    // a new one interrupts the last, and without this its promise would resolve
    // a moment later and mark the *new* step as done before it had moved.
    void morphing.then((finished) => {
      if (!finished || this.currentState !== 'transitioning') return
      this.currentState = 'running'
      this.say(step, action)
    })
  }

  /**
   * Notice when the step's target leaves the page.
   *
   * Without this the cutout would sit over the gap where the element used to
   * be, which is the worst of both: the page is dimmed, and the one thing the
   * user was told to act on is not there. Mutations are watched rather than
   * polled, so this stays off the frame budget.
   */
  private watchTarget(step: LekoStep, action: HTMLElement): void {
    this.watcher?.disconnect()
    this.watcher = new MutationObserver(() => {
      if (action.isConnected) return
      this.lose(step)
    })
    this.watcher.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * Resizing changes the surface the path is drawn on, so the path is rebuilt —
   * placed, not replayed. Scrolling deliberately is not listened for: the scrim
   * sits inside whatever scrolls, so it moves with the target on its own.
   */
  private watchViewport(): void {
    this.onViewportChange = () => this.place()
    window.addEventListener('resize', this.onViewportChange)
  }

  private lose(step: LekoStep): void {
    // Whatever the host decides to do about it, the message goes now: its anchor
    // has left the page, and an anchored element whose anchor is gone falls back
    // to wherever normal positioning puts it.
    this.message?.hide()
    if (this.options.onTargetLost) {
      this.options.onTargetLost(step)
      return
    }
    this.stop()
  }

  private teardown(): void {
    this.watcher?.disconnect()
    this.watcher = undefined
    if (this.onViewportChange) {
      window.removeEventListener('resize', this.onViewportChange)
      this.onViewportChange = undefined
    }
    for (const layer of this.layers) layer.destroy()
    this.layers = []
  }
}

export function createLeko(options: LekoOptions): Leko {
  return new Leko(options)
}
