import type { Content, Host, Presenter } from '@annetaan/leko-machine'
import {
  Close,
  type Cutout,
  findScrollContainer,
  FocusRing,
  grow,
  Message,
  paddingBoxWithin,
  type Rect,
  rectWithin,
  resolveTarget,
  resolveTargets,
  Scrim,
  type Side,
  union,
} from '@annetaan/leko-spotlight'
import type { LekoOptions, LekoRegion, LekoStep, LekoTarget, LekoWorld } from './types.js'

const DEFAULTS = { padding: 8, radius: 8, duration: 320 } as const

/**
 * How long a target that is not on the page is given to turn up.
 *
 * About six frames. `onEnter` returns synchronously and a framework paints at
 * least a frame after that, so a target the application is rendering right now
 * lands well inside this. Nothing is redrawn while it runs, so the window costs
 * the viewer nothing and there is no reason to make it long enough to notice.
 *
 * A wait the application knows it is having is a step of its own, with no
 * `target` and an `awaits`. This is for the gap between a step arriving and its
 * target existing, and for a target that goes away again afterwards.
 */
const RETRY = 100

/**
 * The step's regions, as a list. One cutout each, in the order they were
 * written, so a bare target reads as the list of one that it is.
 *
 * Empty where the step named nothing, which is the step that waits.
 */
const regionsOf = (target: LekoStep['target']): LekoRegion[] => {
  if (target === undefined) return []
  return Array.isArray(target) ? target : [target]
}

/** The elements one region unions together. */
const targetsIn = (region: LekoRegion): LekoTarget[] => (Array.isArray(region) ? region : [region])

/**
 * Everything in the region a step opened, or nothing where it opened none.
 *
 * The ring's first segment. A step that shows a hole without opening it has
 * nothing here, so Tab has nowhere to be but Leko's own chrome.
 */
const openElements = (step: LekoStep): HTMLElement[] => {
  if (step.interactive !== true) return []
  const first = regionsOf(step.target)[0]
  return first === undefined ? [] : resolveTargets(targetsIn(first))
}

/**
 * The one element the step is about: the first target of its first region.
 *
 * `undefined` where the step named no region at all. That step is not a step
 * with a target Leko cannot find. It is a step that points at nothing on
 * purpose, and the page is covered for it.
 */
const actionTarget = (target: LekoStep['target']): LekoTarget | undefined => {
  const first = regionsOf(target)[0]
  return first === undefined ? undefined : targetsIn(first)[0]
}

/**
 * The half of Leko that touches the page: one scrim per scrolling ancestor, the
 * hole cut through them, and the message beside it.
 *
 * It decides nothing about where the tour is. Every call here comes from the
 * machine, and the two things this notices on its own — a target leaving the
 * page and the window resizing — are reported back through {@link Host} rather
 * than acted on, because whether the tour may be measured at all is the
 * machine's to know.
 */
export class DomPresenter implements Presenter<LekoWorld> {
  private readonly options: LekoOptions
  private readonly host: Host<LekoWorld>
  /**
   * One scrim per scrolling ancestor, innermost first, always ending with the
   * document. Only the innermost carries the step's cutouts; each outer one is
   * cut to the shape of the scroller inside it, so the layers together dim the
   * whole page while each still scrolls with its own content.
   */
  private layers: Scrim[] = []
  /**
   * Outlives the scrims on purpose. A step in a different scroller rebuilds the
   * stack, and the box holding the instruction should not blink while that
   * happens.
   */
  private message: Message | undefined
  /**
   * The way out of the tour, made with the first thing drawn and destroyed with
   * the last. It outlives the scrims and the message for the reason the message
   * outlives the scrims, and more so: it is the one thing that must never
   * blink, because it is what somebody reaches for when the page stops
   * behaving.
   */
  private close: Close | undefined
  /**
   * The ring Tab cannot leave while anything is drawn.
   *
   * Made and destroyed with the rest of the chrome. The blocking rectangles
   * stop a click on a hole the step did not open, and they do nothing at all
   * about a key, so without this the same element is one Tab away.
   */
  private ring: FocusRing | undefined
  private onViewportChange: (() => void) | undefined
  /**
   * The one observer this owns, watching the step on screen or the step being
   * waited for. Both jobs are the same job, and neither may be armed twice.
   */
  private watcher: MutationObserver | undefined
  /**
   * The last step handed over, kept so that a target which comes back can be
   * drawn again without the machine being told anything happened.
   */
  private drawn: { step: LekoStep; content: Content } | undefined
  /** The deadline on a target that is not on the page, while one is running. */
  private retrying: ReturnType<typeof setTimeout> | undefined

  constructor(options: LekoOptions, host: Host<LekoWorld>) {
    this.options = options
    this.host = host
  }

  /**
   * Step, then instance: the nearer of the two that says anything wins.
   *
   * Two tiers rather than three. A story used to sit between them, and carrying
   * it here was the whole reason this half of Leko knew what a story was.
   */
  private setting(step: LekoStep, key: 'padding' | 'radius'): number {
    return step[key] ?? this.options[key] ?? DEFAULTS[key]
  }

  /** Whether this step has anything to point at. A step that has not is a wait. */
  private static pointsAt(step: LekoStep): boolean {
    return actionTarget(step.target) !== undefined
  }

  resolve(step: LekoStep): HTMLElement | null {
    const action = actionTarget(step.target)
    return action === undefined ? null : resolveTarget(action)
  }

  /**
   * The step's cutouts, in whatever space `measure` reports in.
   *
   * The scrim wants them in its own content coordinates; the message wants the
   * same shapes in viewport coordinates, to work out which side of them has room
   * on screen. Same geometry, two readers, so the space is the parameter.
   */
  private cutouts(step: LekoStep, measure: (el: HTMLElement) => Rect): Cutout[] | null {
    const regions = regionsOf(step.target)
    // A step that names nothing cuts nothing, and a scrim with no holes in it
    // is one rectangle over everything. That is the whole of what a step that
    // waits looks like, so it is the empty list rather than the `null` below.
    if (regions.length === 0) return []
    const padding = this.setting(step, 'padding')
    const radius = this.setting(step, 'radius')
    // One box per region. A region is unioned because the space between its
    // elements is meant to be inside the hole with them. Two regions stay
    // apart because the union of two distant ones would cover everything
    // between them, which is a hole the size of the page.
    const boxes = regions.map((region) => union(resolveTargets(targetsIn(region)).map(measure)))
    // The first region is the one the step is about, and a step with nothing to
    // point at is not drawn at all. A later one that resolves to nothing is a
    // hole this step does not cut, and nothing else follows from it.
    if (!boxes[0]) return null
    return boxes
      .flatMap((box, i) => (box === null ? [] : [[box, i] as const]))
      .map(([box, i]) => ({
        ...grow(box, padding),
        radius,
        // Off unless the step asked, and only ever for the first region. A
        // later region is there to be looked at, and no flag opens one.
        interactive: i === 0 && step.interactive === true,
      }))
  }

  /**
   * Put the message beside the step's cutouts.
   *
   * Two measurements of the same holes. The side is chosen from viewport
   * coordinates, because what decides it is how much room is on screen right
   * now. The anchor point is written in the scrim's coordinates, because that
   * is the space the scroller carries — and once it is written, the browser
   * holds the message beside it through every scroll that follows, with no
   * script involved.
   */
  private say(step: LekoStep, content: Content): void {
    const onScreen = this.cutouts(step, (el) => el.getBoundingClientRect())
    this.showClose(onScreen ?? [])
    if (!content.text && !content.error && !content.next) {
      this.message?.hide()
      this.showRing(step)
      return
    }
    this.message ??= new Message(() => this.host.next())
    const gap = this.setting(step, 'padding')
    const inner = this.layers[0]
    const within = inner && this.cutouts(step, (el) => rectWithin(el, inner.container))
    const box = within && union(within)
    this.message.show(
      content,
      onScreen ?? [],
      gap,
      // Absent where there is no scrim to hang the anchor in, which is what
      // makes the box dock instead.
      inner && box ? (side) => inner.anchorAt(...DomPresenter.edge(box, side)) : undefined,
    )
    // Last, so the next control is showing by the time the ring is asked
    // whether the message is a stop.
    this.showRing(step)
  }

  /**
   * The midpoint of one edge of `box`, which is where the message's anchor goes.
   *
   * The edge rather than the middle: the anchor has no area, so `position-area`
   * lays the box out from this point alone, and a point in the middle of the
   * hole would put the message over half of it.
   */
  private static edge(box: Rect, side: Side): [number, number] {
    const midX = box.x + box.width / 2
    const midY = box.y + box.height / 2
    if (side === 'bottom') return [midX, box.y + box.height]
    if (side === 'top') return [midX, box.y]
    if (side === 'right') return [box.x + box.width, midY]
    return [box.x, midY]
  }

  /**
   * Put the way out where no cutout covers it.
   *
   * Made the first time anything is drawn rather than when the run starts,
   * because until something is drawn nothing is blocked and there is nothing to
   * get out of. Placed again on every step and every resize, so a hole that
   * moves into the corner it was in pushes it to another.
   *
   * There is no way to skip this. Whatever the scrim blocks, this is what gets
   * out of it, and `renderClose` is how a host owns the markup without owning
   * the decision.
   */
  private showClose(cutouts: readonly Rect[]): void {
    this.close ??= new Close(
      () => this.host.close(),
      this.options.closeLabel,
      this.options.renderClose,
    )
    this.close.place(cutouts)
  }

  /**
   * Say what Tab may reach, now.
   *
   * Called wherever the chrome or the step changes, because every one of those
   * moves a stop.
   *
   * The message goes in whether or not it is showing. A hidden one has nothing
   * Tab would land on, so `FocusRing` drops it, and a step with no next control
   * on its message drops out the same way.
   */
  private showRing(step: LekoStep): void {
    this.ring ??= new FocusRing()
    this.ring.set([
      openElements(step),
      this.message ? [this.message.element] : [],
      this.close ? [this.close.element] : [],
    ])
  }

  /**
   * Every scrolling ancestor of `el`, innermost first, always ending in `null`
   * for the document itself.
   */
  private static chainOf(el: HTMLElement): (HTMLElement | null)[] {
    const container = findScrollContainer(el)
    return container ? [container, ...DomPresenter.chainOf(container)] : [null]
  }

  /** Each outer layer is cut to the scroller nested inside it. */
  private cutOuterLayers(chain: (HTMLElement | null)[]): void {
    this.layers.slice(1).forEach((layer, i) => {
      const nested = chain[i]
      if (!nested) return
      // Match the scroller's own rounding, or its corners show through the hole.
      const radius = parseFloat(getComputedStyle(nested).borderTopLeftRadius) || 0
      // Always interactive. This hole is where the scrim below it lives, and a
      // rectangle over it would block that whole scroller, cutouts and all.
      // What is reachable inside it is the inner layer's to say.
      layer.set([{ ...paddingBoxWithin(nested, layer.container), radius, interactive: true }])
    })
  }

  show(step: LekoStep, anchor: HTMLElement | null, content: Content, animate: boolean): void {
    // Whatever was being waited for, the tour is somewhere else now. Dropped
    // here rather than left to run, so a target that turns up late is not drawn
    // over the step this call is about. It is also what leaves {@link retry}
    // with only one of itself to think about.
    this.endRetry()
    // Named a target and it is not on the page yet, which a step whose target
    // renders a moment after its `onEnter` returned is as much as one whose
    // target has gone. A step that named nothing is not looked for.
    if (!anchor && DomPresenter.pointsAt(step)) return this.retry(step, content, animate)
    this.reveal(step, anchor, content, animate)
  }

  /**
   * Draw the step.
   *
   * `anchor` is `null` on a step that points at nothing. There is no scroller to
   * find for one of those, so the document carries it, and everything below
   * lands on the empty list of cutouts.
   */
  private reveal(
    step: LekoStep,
    anchor: HTMLElement | null,
    content: Content,
    animate: boolean,
  ): void {
    // The step being left is over, so its words go. Nothing is painted between
    // here and the morph below, so this is the same moment the arrival began.
    this.message?.hide()
    const chain = DomPresenter.chainOf(anchor ?? document.body)
    // A step in a different set of scrollers needs a different stack of scrims.
    // Rebuilding is not a morph, so it happens outright rather than half-way.
    const sameStack =
      this.layers.length === chain.length && this.layers.every((l, i) => l.container === chain[i])
    if (!sameStack) this.destroyLayers()

    if (this.layers.length === 0) {
      this.layers = chain.map((container) => new Scrim(container))
      this.watchViewport()
    }

    const container = chain[0] ?? null
    const resolved = this.cutouts(step, (el) => rectWithin(el, container))
    if (!resolved) return this.retry(step, content, animate)

    const inner = this.layers[0]
    if (!inner) return this.retry(step, content, animate)

    // Kept so that a target which comes back can be drawn again without the
    // machine hearing that anything happened.
    this.drawn = { step, content }

    // These holes move only when layout does, never when something scrolls.
    this.cutOuterLayers(chain)

    if (!animate) {
      // Open from a hole larger than the surface, so the scrim converges inward
      // rather than appearing already cut.
      const w = inner.element.offsetWidth
      const h = inner.element.offsetHeight
      const m = Math.max(w, h)
      // Not interactive, so the page is blocked for the whole of the opening.
      // The morph below re-blocks in the same task, so no frame carries this.
      inner.set([
        { x: -m, y: -m, width: w + m * 2, height: h + m * 2, radius: 0, interactive: false },
      ])
    }

    // Nothing to watch on a step that points at nothing, and a watcher left
    // armed on the step before would report against this one.
    this.watcher?.disconnect()
    this.watcher = undefined
    if (anchor) this.watchTarget(anchor)

    // Before the morph, not after it. The scrim blocks the page from the moment
    // it is set, and a page that is blocked with no way out of it is the thing
    // this control exists to prevent, even for the length of one morph.
    this.showClose(this.cutouts(step, (el) => el.getBoundingClientRect()) ?? [])
    // Before the morph too. The message is away for the whole of it, and the
    // target is already reachable, so the ring is already two stops short of
    // what `say` will make it.
    this.showRing(step)

    // The message went when the last step did, and comes back once the cutout
    // has arrived. The side with room is a fact about where the hole ends up,
    // so there is nowhere honest to put it while one is on its way.
    const duration = this.options.duration ?? DEFAULTS.duration
    const morphing = inner.morph(resolved, duration)
    if (!morphing) {
      this.say(step, content)
      return
    }
    // The message comes back with the hole it belongs beside, and only if the
    // morph got there. Another arrival starting is the only thing that
    // interrupts one, and that arrival is drawing its own step already.
    void morphing.then((finished) => {
      if (finished) this.say(step, content)
    })
  }

  /**
   * Put the cutouts where they belong, right now and without animating.
   *
   * Used when the surface moved under the tour rather than the tour moving —
   * a resize, say. Replaying the opening there would blow the cutout back up to
   * the size of the page and converge again, so for a moment almost nothing
   * would be dimmed.
   */
  place(step: LekoStep, anchor: HTMLElement | null, content: Content): void {
    const inner = this.layers[0]
    if (!inner) return
    for (const layer of this.layers) layer.resize()
    this.cutOuterLayers(DomPresenter.chainOf(anchor ?? document.body))
    const resolved = this.cutouts(step, (el) => rectWithin(el, inner.container))
    if (!resolved) return
    inner.set(resolved)
    // The message needs no help to follow a scroll, but a resize can leave the
    // side it was put on without room, so that choice is made again. The way out
    // is placed from the viewport, so it is chosen again too.
    this.say(step, content)
  }

  /**
   * Nothing has moved, so a message already on screen only changes its words.
   * Re-placing it would jump the box out from under someone in the middle of
   * reading why they were stopped. A step that had no message until now has
   * nowhere to jump from, so that one is placed properly.
   */
  retell(step: LekoStep, content: Content): void {
    if (this.message?.visible) {
      this.message.setText(content.text ?? '')
      this.message.setError(content.error ?? '')
      return
    }
    this.say(step, content)
  }

  reject(): void {
    this.layers[0]?.shake()
  }

  /**
   * Notice when the step's target leaves the page.
   *
   * The cutout stands over the gap the element left until this answers, and
   * without it that is where the tour would stay: the page dimmed, and the one
   * thing the user was told to act on not there. Mutations are watched rather
   * than polled, so this stays off the frame budget.
   *
   * The step is read off {@link drawn} rather than closed over, because what has
   * to be drawn again is whatever was drawn last.
   */
  private watchTarget(action: HTMLElement): void {
    this.watch(() => {
      if (action.isConnected) return
      const held = this.drawn
      if (!held) return
      // The batch that disconnected this node usually carries its replacement,
      // and that is the whole of a framework rendering over the step. A retry
      // started now would never see it: the mutation that added it has already
      // been delivered, and an observer hears nothing about the past. So the
      // selector is run here, and a re-render costs a morph and nothing else.
      const back = this.resolve(held.step)
      if (back) return this.show(held.step, back, held.content, true)
      // Nothing is holding what this hands back. The machine hears about this
      // wait only if it runs out, and then it hears `lost`.
      this.retry(held.step, held.content, true)
    })
  }

  /**
   * Arm the one observer on the whole document.
   *
   * Both things this watches for are the same event: a batch of mutations that
   * may have taken the step's target away or brought it back. One observer, so
   * neither job can leave a second one running behind the other.
   */
  private watch(run: () => void): void {
    this.watcher?.disconnect()
    this.watcher = new MutationObserver(run)
    this.watcher.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * A target that is not on the page is given a moment to turn up.
   *
   * Two things arrive here. A target that is not there when the step is drawn,
   * which is a framework that has not painted yet, and a target that leaves
   * after the step was drawn, which is a framework rendering over it.
   *
   * **Nothing on screen changes while this runs.** Whatever was drawn a moment
   * ago stays exactly as it was, so a target that comes back costs a morph and
   * nothing else. The hole stands over the gap the target left while it does,
   * and DESIGN.md argues that trade under **Nothing is drawn for a retry**.
   *
   * **The target is resolved again rather than the old element re-checked.**
   * `isConnected` on a node that has been replaced is false for ever, and a
   * fresh resolve finds the replacement. A `target` given as an `HTMLElement`
   * has no selector to run again, so it cannot be recovered and this waits out
   * the deadline for nothing.
   *
   * The retry rides the same observer that noticed the loss, so it costs no
   * polling and the deadline is a bound rather than a wait anybody sits
   * through. Found in time, the step is drawn again and nothing about the tour
   * has changed. Not found, `Host.lost` means what it has always meant.
   *
   * **Nothing is handed back and nobody is waiting.** As far as the machine is
   * concerned the step is on screen, and it is: what is on screen is whatever
   * this was showing a moment ago. `Host.lost` is the only part of this the
   * machine ever hears.
   *
   * Only one of these can be running. Every call into {@link show} ends the
   * last one, and the observer that starts the other one is armed only while
   * none is.
   */
  private retry(step: LekoStep, content: Content, animate: boolean): void {
    this.watch(() => {
      const found = this.resolve(step)
      if (found) this.show(step, found, content, animate)
    })
    this.retrying = setTimeout(() => {
      this.endRetry()
      this.host.lost(step)
    }, RETRY)
  }

  /** End the retry, whichever way it went. The observer is armed again by whatever draws next. */
  private endRetry(): void {
    if (this.retrying === undefined) return
    clearTimeout(this.retrying)
    this.retrying = undefined
    this.watcher?.disconnect()
    this.watcher = undefined
  }

  /**
   * Resizing changes the surface the path is drawn on, so the path is rebuilt —
   * placed, not replayed. Scrolling deliberately is not listened for: the scrim
   * sits inside whatever scrolls, so it moves with the target on its own.
   */
  private watchViewport(): void {
    this.onViewportChange = () => this.host.moved()
    window.addEventListener('resize', this.onViewportChange)
  }

  /** The scrims and what watches them. The message outlives this. */
  private destroyLayers(): void {
    this.watcher?.disconnect()
    this.watcher = undefined
    if (this.onViewportChange) {
      window.removeEventListener('resize', this.onViewportChange)
      this.onViewportChange = undefined
    }
    for (const layer of this.layers) layer.destroy()
    this.layers = []
  }

  teardown(): void {
    // The retry goes with everything else. A tour that has been stopped drawing
    // itself back onto the page 100ms later is the worst of the lot, because
    // nothing is left to take it away again.
    this.endRetry()
    this.drawn = undefined
    this.destroyLayers()
    this.message?.destroy()
    this.message = undefined
    this.close?.destroy()
    this.close = undefined
    this.ring?.destroy()
    this.ring = undefined
  }
}
