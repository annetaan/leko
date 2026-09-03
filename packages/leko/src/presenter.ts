import type { Host, Presenter } from '@annetaan/leko-machine'
import {
  bringIntoView,
  Close,
  type Cutout,
  FocusRing,
  grow,
  Message,
  type MessageContent,
  paddingBoxWithin,
  type Rect,
  rectWithin,
  resolveTarget,
  resolveTargets,
  sameSurface,
  Scrim,
  type Side,
  type Surface,
  surfaceChain,
  union,
} from '@annetaan/leko-spotlight'
import {
  actionTarget,
  type Drawn,
  type Effect,
  type Event,
  idle,
  type Mode,
  pointsAt,
  reduce,
  regionsOf,
} from './plan.js'
import type { LekoOptions, LekoStep, LekoWorld } from './types.js'

const DEFAULTS = { padding: 8, radius: 8, duration: 320 } as const

/** What the next control reads until an instance says otherwise. */
const NEXT_LABEL = 'Next'

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
 * Everything in the region a step opened, or nothing where it opened none.
 *
 * The ring's first segment. A step that shows a hole without opening it has
 * nothing here, so Tab has nowhere to be but Leko's own chrome.
 */
const openElements = (step: LekoStep): Element[] => {
  const first = regionsOf(step.target)[0]
  return first?.interactive ? resolveTargets(first.elements) : []
}

/**
 * Every element of the hole the step is about, `anchor` first.
 *
 * What a scroll brings in, and the whole first region rather than `anchor`
 * alone, because the hole is what the step is about. Centred on its first
 * element, a region of two cuts a hole that sits half their gap low — the
 * second element below the middle, or past the fold with a gap wide enough —
 * and a union taller than half the port is centred like a small one, which is
 * the case the top-edge rule exists for. Later regions are not brought in: a
 * hole the step shows without opening is there to be looked at, and a step that
 * wants it on screen puts it in the first region.
 *
 * `anchor` is the first element already resolved, so it heads the list rather
 * than being resolved twice, and the list is never empty.
 */
const lit = (step: LekoStep, anchor: Element): [Element, ...Element[]] => {
  const [, ...rest] = regionsOf(step.target)[0]?.elements ?? []
  return [anchor, ...resolveTargets(rest)]
}

/**
 * The half of Leko that touches the page: one scrim per surface that carries
 * the target, the hole cut through them, and the message beside it.
 *
 * It decides nothing about where the tour is. Every call here comes from the
 * machine, and the two things this notices on its own — a target leaving the
 * page and the window resizing — are reported back through {@link Host} rather
 * than acted on, because whether the tour may be measured at all is the
 * machine's to know.
 *
 * **Nor does it decide where it is itself.** `plan.ts` answers an event with the
 * next mode and the effects owed, and this commits the one and performs the
 * others. What the page says — whether a target resolved, which glide landed —
 * is read here and carried into the event as data. A decision that lands in
 * this file is in the wrong file.
 */
export class DomPresenter implements Presenter<LekoWorld> {
  /**
   * Where this is between calls. Written by {@link dispatch} and nothing else,
   * and read by nothing here but the plan. The chrome below is not part of it:
   * which scrims stand and whether a message exists are facts about the page,
   * and the mode says what they are for.
   */
  #mode: Mode = idle
  private readonly options: LekoOptions
  private readonly host: Host<LekoWorld>
  /**
   * One scrim per surface carrying the target, innermost first — its
   * scrollers, then the document, or the viewport alone for a target that
   * `position: fixed` holds against it. Only the innermost carries the step's
   * cutouts; each outer one is cut to the shape of the scroller inside it, so
   * the layers together dim the whole page while each still moves with what it
   * is inside.
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
   * The one observer this owns. What it is armed for — the target of the step
   * on screen, or the page for a target that has not turned up — is the mode's
   * to say, and the plan arms and disarms it by effect, so neither job can
   * leave a second one running behind the other.
   */
  private watcher: MutationObserver | undefined
  /**
   * The clock on a retry, while one runs. Which wait it is for is the mode's
   * `pending`; this is the handle the page handed back, held here because a
   * pure plan cannot make one, and armed and cleared by effect the way the
   * watcher is.
   */
  private deadline: ReturnType<typeof setTimeout> | undefined

  constructor(options: LekoOptions, host: Host<LekoWorld>) {
    this.options = options
    this.host = host
  }

  // -------------------------------------------------------------- what a step asks

  /**
   * Step, then instance: the nearer of the two that says anything wins.
   *
   * Two tiers rather than three. A story used to sit between them, and carrying
   * it here was the whole reason this half of Leko knew what a story was.
   */
  private setting(step: LekoStep, key: 'padding' | 'radius'): number {
    return step[key] ?? this.options[key] ?? DEFAULTS[key]
  }

  /** How long a morph runs. The scroll before it follows the same number. */
  private duration(): number {
    return this.options.duration ?? DEFAULTS.duration
  }

  /**
   * Whether this step brings its target into view before it is drawn.
   *
   * Step, then instance, and **off unless somebody asks**. Where the page is
   * scrolled to is application state, and a tour that moves it has touched the
   * application — so a host says so rather than being given it. DESIGN.md
   * argues it under **Bringing a target into view**.
   */
  private scrolls(step: LekoStep): boolean {
    return step.scroll ?? this.options.scroll ?? false
  }

  resolve(step: LekoStep): Element | null {
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
  private cutouts(step: LekoStep, measure: (el: Element) => Rect): Cutout[] | null {
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
    const boxes = regions.map((region) => union(resolveTargets(region.elements).map(measure)))
    // The first region is the one the step is about, and a step with nothing to
    // point at is not drawn at all. A later one that resolves to nothing is a
    // hole this step does not cut, and nothing else follows from it.
    if (!boxes[0]) return null
    return boxes
      .flatMap((box, i) => (box === null ? [] : [[box, i] as const]))
      .map(([box, i]) => ({
        ...grow(box, padding),
        radius,
        // Open only where the region asked, which the type allows of the first
        // alone. A later region is there to be looked at, and no flag opens one.
        interactive: regions[i]?.interactive === true,
      }))
  }

  // ---------------------------------------------------------- what the machine calls

  show(step: LekoStep, anchor: Element | null, animate: boolean): void {
    // An arrival is a fresh attempt at the step, so nothing is owed under the
    // instruction until a guard says otherwise.
    this.arrive(step, anchor, animate, undefined)
  }

  /**
   * An arrival, from the machine or from a hunt that found its target.
   *
   * **The one place a scroll happens.** After the target resolved, so there is
   * something to scroll to, and before anything is measured, so every box the
   * step is drawn from is read off the page as it ends up. Started here rather
   * than owed by the plan because it has to start from where the target is,
   * which only this can ask; what it answered goes into the event as a fact.
   * A redraw goes through {@link reveal} and must not scroll again, the viewer
   * having had every right to move the page since.
   *
   * `undefined` from `bringIntoView` means there was nothing to wait for —
   * every port already held the cutout, or the move was applied outright — and
   * the plan draws the step in the same task the arrival came in on. A glide
   * means the page is moving, and its landing comes back as its own event, with
   * the target resolved again where the page stopped. An abandoned glide never
   * settles, so a landing is always about a glide that was left to run.
   */
  private arrive(
    step: LekoStep,
    anchor: Element | null,
    animate: boolean,
    error: string | undefined,
  ): void {
    const glide =
      anchor && this.scrolls(step)
        ? bringIntoView(lit(step, anchor), this.setting(step, 'padding'), this.duration())
        : undefined
    if (glide) {
      void glide.settled.then(() => {
        this.dispatch({ kind: 'settled', glide, anchor: this.resolve(step) })
      })
    }
    this.dispatch({ kind: 'show', step, anchor, animate, glide, error })
  }

  retell(step: LekoStep, reason: string): void {
    this.dispatch({ kind: 'retell', step, reason })
  }

  reject(): void {
    this.layers[0]?.shake()
  }

  teardown(): void {
    this.dispatch({ kind: 'teardown' })
  }

  // -------------------------------------------------------------------- the shell

  /**
   * **The mode is written before any effect runs.** `lost` calls into the
   * machine, which tears this down from inside the call, and what that teardown
   * finds is the mode as the event left it. An effect that comes back in here —
   * `reveal`, `arrive`, `lost` — is the last of its outcome, so nothing below
   * runs against a mode a nested dispatch has replaced; `Outcome` says so, and
   * `plan.test.ts` checks it.
   */
  private dispatch(event: Event): void {
    const outcome = reduce(this.#mode, event)
    this.#mode = outcome.mode
    for (const effect of outcome.effects) this.perform(effect)
  }

  /**
   * Make one change to the page. What the page answers comes back as an event
   * rather than being acted on here, because acting on it is a decision.
   */
  private perform(effect: Effect): void {
    switch (effect.kind) {
      case 'abandon':
        return effect.glide.abandon()
      case 'hide':
        return this.message?.hide()
      case 'disarm':
        return this.disarm()
      case 'watch':
        return this.watch(effect.step, effect.anchor)
      case 'hunt':
        return this.watch(effect.step, null)
      case 'deadline': {
        const { pending } = effect
        this.cancel()
        this.deadline = setTimeout(() => this.dispatch({ kind: 'expired', pending }), RETRY)
        return
      }
      case 'cancel':
        return this.cancel()
      case 'reveal':
        return this.reveal(effect.drawn, effect.anchor, effect.animate)
      case 'replace':
        return this.replace(effect.drawn, effect.saying)
      case 'say':
        return this.say(effect.drawn.step, effect.drawn.error)
      case 'retell':
        return this.retold(effect.step, effect.reason)
      case 'arrive':
        return this.arrive(effect.pending.step, effect.anchor, effect.pending.animate, effect.error)
      case 'lost':
        return this.host.lost(effect.step)
      case 'destroy':
        return this.destroy()
    }
  }

  // ---------------------------------------------------------------------- drawing

  /**
   * The layers under `anchor`, cut for `step`, and the cutouts to draw in the
   * innermost. Every draw and every redraw comes through here, so the sequence
   * — which surfaces carry the target, the layers for them, the outer holes,
   * the inner boxes — is written once. `undefined` where there was nothing to
   * measure, and what that means is the caller's.
   */
  private measure(
    step: LekoStep,
    anchor: Element | null,
  ): { inner: Scrim; resolved: Cutout[] } | undefined {
    const chain = surfaceChain(anchor ?? document.body)
    const inner = this.restack(chain)
    const resolved = inner && this.cutouts(step, (el) => rectWithin(el, inner.surface))
    if (!inner || !resolved) return undefined
    // These holes move only when layout does, never when something scrolls.
    this.cutOuterLayers(chain)
    return { inner, resolved }
  }

  /**
   * The way out and the ring, where the holes are now. The words are {@link say}'s.
   *
   * Placed from no holes at all where the step's target is not on the page,
   * which can put the way out over the hole standing there; a corner the viewer
   * can reach beats one a resize took off screen.
   */
  private place(step: LekoStep): void {
    this.showClose(this.cutouts(step, (el) => el.getBoundingClientRect()) ?? [])
    this.showRing(step)
  }

  /**
   * Draw what a viewer is to be looking at. `anchor` is `null` on a step that
   * points at nothing: there is no surface to find for one of those, so the
   * document carries it, and everything below lands on the empty list of
   * cutouts.
   */
  private reveal(drawn: Drawn, anchor: Element | null, animate: boolean): void {
    const { step } = drawn
    // The step being left is over, so its words go. Nothing is painted between
    // here and the morph below, so this is the same moment the arrival began.
    this.message?.hide()
    const measured = this.measure(step, anchor)
    // The anchor resolved a moment ago in this same task, so its region has a
    // box to measure and its chain has a surface, and this is not reached.
    // Kept as the last line of defence, and it says what happened rather than
    // guessing what it means.
    if (!measured) return this.dispatch({ kind: 'unmeasured', step, animate })
    const { inner, resolved } = measured

    // Open from every hole stretched over the surface, so the scrim converges
    // each inward rather than opening it out of nothing. The morph below
    // re-blocks in the same task, so no frame carries the opening's blocking.
    if (!animate) inner.converge(resolved)

    // Before the morph, not after it. The scrim blocks the page from the moment
    // it is set, and a page that is blocked with no way out of it is the thing
    // that control exists to prevent, even for the length of one morph. The
    // ring too: the message is away for the whole of it and the target is
    // already reachable, so the ring is already two stops short of what `say`
    // will make it.
    this.place(step)

    // The message went when the last step did, and comes back once the cutout
    // has arrived. The side with room is a fact about where the hole ends up,
    // so there is nowhere honest to put it while one is on its way. Whether the
    // morph got there is the one thing read here: which words come back with
    // it is the plan's.
    const morphing = inner.morph(resolved, this.duration())
    if (!morphing) return this.dispatch({ kind: 'morphed', step })
    void morphing.then((finished) => {
      if (finished) this.dispatch({ kind: 'morphed', step })
    })
  }

  /**
   * Put the cutouts where they belong, right now and without animating, and
   * the words beside them where `saying` says.
   *
   * The surface moved under the tour rather than the tour moving. Replaying the
   * opening would blow the cutout back up to the size of the page and converge
   * again, so for a moment almost nothing would be dimmed. The way out is placed
   * from the viewport, so it is chosen again too, and where the words come back
   * they choose their side again: a resize can leave the one they were on
   * without room.
   */
  private replace(drawn: Drawn, saying: boolean): void {
    const { step } = drawn
    // A step whose target is not on the page this instant is one a mutation
    // batch is about to report, and there is no surface to put layers under.
    // Restacking against the document instead would destroy the layers the
    // standing hole and its blocking rectangles live in, and the measuring
    // below would then find nothing to cut in their place, leaving the page
    // dimmed with nothing held back. Nothing is drawn for a retry, here as
    // anywhere else — and no words either, which would be said beside holes
    // that could not be found. The way out is placed all the same.
    const anchor = this.resolve(step)
    if (!anchor && pointsAt(step)) return this.place(step)
    const measured = this.measure(step, anchor)
    if (!measured) return this.place(step)
    measured.inner.set(measured.resolved)
    if (saying) return this.say(step, drawn.error)
    this.place(step)
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
  private say(step: LekoStep, error: string | undefined): void {
    const content = this.content(step, error)
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
    const within = inner && this.cutouts(step, (el) => rectWithin(el, inner.surface))
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
   * Nothing has moved, so a message already on screen only changes its words.
   * Re-placing it would jump the box out from under someone in the middle of
   * reading why they were stopped. A step that had no message until now has
   * nowhere to jump from, so that one is placed properly.
   */
  private retold(step: LekoStep, reason: string): void {
    if (this.message?.visible) {
      this.message.setText(step.message ?? '')
      this.message.setError(reason)
      return
    }
    this.say(step, reason)
  }

  /**
   * Everything the box beside the cutout shows at once.
   *
   * **Which steps have a next control is derived here, and nowhere else.** A
   * step that declares `awaits` never gets one, because pressing past it is the
   * whole of what that step exists to prevent, and `nextLabel` only says what
   * the control reads. The machine holds the rule as well — a press on such a
   * step moves nothing — but that is a different job: this decides whether to
   * draw, the machine decides whether to move. DESIGN.md argues it under
   * **The next control**.
   *
   * `message` is read every time the box is filled rather than copied when the
   * story was written, so a host editing its own text is seen.
   */
  private content(step: LekoStep, error: string | undefined): MessageContent {
    return {
      text: step.message,
      error,
      next: step.awaits === undefined ? (this.options.nextLabel ?? NEXT_LABEL) : undefined,
    }
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
   * The stack that carries `chain`, measured against the surface as it is now,
   * made afresh where the one standing is for other surfaces, and answered
   * innermost first.
   *
   * A layer rides what its target rides, so a target that has moved from one
   * surface to another has to be given the layers of the new one. That happens
   * when the tour moves to a step in a different set of scrollers, and it
   * happens without the tour moving at all: a breakpoint that pins a header
   * takes it off the document and gives it to the viewport, and a document
   * layer left under it carries the hole away on the next scroll while the
   * header stays. Rebuilding is not a morph, so it happens outright rather
   * than half-way.
   *
   * A stack kept is measured again, because the surface can have changed
   * size while nothing was drawn. Nothing is drawn for a retry, so a resize
   * that lands while a target is missing is not acted on then — and the step
   * drawn afterwards would otherwise go into layers sized for a page that has
   * since grown, leaving a strip along the new edge neither dimmed nor blocked
   * until the next resize. Every caller here is already reading layout, so the
   * measurement costs nothing it was not paying. A fresh stack measures itself
   * as it is built.
   *
   * Nothing here touches the target watcher. Which node a step is watching is
   * a fact about the step rather than about the surfaces under it, and a
   * redraw that leaves the step where it was leaves that alone.
   */
  private restack(chain: Surface[]): Scrim | undefined {
    const same =
      this.layers.length === chain.length &&
      this.layers.every((l, i) => {
        const surface = chain[i]
        return surface !== undefined && sameSurface(l.surface, surface)
      })
    if (!same) this.destroyLayers()

    if (this.layers.length === 0) {
      // Only the innermost is haloed: it is the one carrying the step's
      // cutouts, and an outer layer's hole is the scroller the next layer
      // lives in rather than anything the step points at.
      this.layers = chain.map(
        (surface, i) => new Scrim(surface, i === 0 ? (this.options.halo ?? 'return') : undefined),
      )
      this.watchViewport()
    } else {
      for (const layer of this.layers) layer.resize()
    }
    return this.layers[0]
  }

  /**
   * Each outer layer is cut to the scroller nested inside it. Every surface
   * with a layer outside it is a scroller: the document and the viewport are
   * each the last of a chain.
   */
  private cutOuterLayers(chain: Surface[]): void {
    this.layers.slice(1).forEach((layer, i) => {
      const nested = chain[i]
      if (nested?.kind !== 'scroller') return
      // Match the scroller's own rounding, or its corners show through the hole.
      const radius = parseFloat(getComputedStyle(nested.element).borderTopLeftRadius) || 0
      // Always interactive. This hole is where the scrim below it lives, and a
      // rectangle over it would block that whole scroller, cutouts and all.
      // What is reachable inside it is the inner layer's to say.
      layer.set([{ ...paddingBoxWithin(nested.element, layer.surface), radius, interactive: true }])
    })
  }

  // --------------------------------------------------------------------- watching

  /**
   * Arm the one observer on the whole document, for `step`.
   *
   * Two jobs and one callback. With an `anchor`, this notices the step's target
   * leaving the page: the cutout stands over the gap the element left until
   * something answers, and without this that is where the tour would stay,
   * the page dimmed and the one thing the user was told to act on not there.
   * With none, it is the hunt for a target that has not turned up. Either way
   * the step is resolved again on the spot rather than the old node re-checked,
   * because `isConnected` on a node that has been replaced is false for ever
   * and a fresh resolve finds the replacement — and because the batch that took
   * a node away usually carries what replaced it, which an observer armed a
   * moment later would never hear about. A `target` given as a function that
   * hands back a held element has no selector to run again, so it cannot be
   * recovered, and a retry for it waits out the deadline for nothing.
   *
   * Mutations are watched rather than polled, so this stays off the frame
   * budget. What the batch means is the plan's: this reports what resolved.
   */
  private watch(step: LekoStep, anchor: Element | null): void {
    this.disarm()
    this.watcher = new MutationObserver(() => {
      if (anchor?.isConnected) return
      this.dispatch({ kind: 'mutated', step, found: this.resolve(step) })
    })
    this.watcher.observe(document.body, { childList: true, subtree: true })
  }

  private disarm(): void {
    this.watcher?.disconnect()
    this.watcher = undefined
  }

  private cancel(): void {
    if (this.deadline === undefined) return
    clearTimeout(this.deadline)
    this.deadline = undefined
  }

  /**
   * Resizing changes the surface the path is drawn on, so the path is rebuilt —
   * placed, not replayed. Scrolling deliberately is not listened for: the scrim
   * sits inside whatever scrolls, so it moves with the target on its own — and
   * the one drawn for a fixed target is fixed itself, so neither moves at all.
   */
  private watchViewport(): void {
    this.onViewportChange = () => this.dispatch({ kind: 'resized' })
    window.addEventListener('resize', this.onViewportChange)
  }

  // ------------------------------------------------------------------ taking down

  /**
   * The scrims and the resize listener that redraws them. The message outlives
   * this, and so does the target watcher: a stack rebuilt under a step that has
   * not moved is still watching the same node.
   */
  private destroyLayers(): void {
    if (this.onViewportChange) {
      window.removeEventListener('resize', this.onViewportChange)
      this.onViewportChange = undefined
    }
    for (const layer of this.layers) layer.destroy()
    this.layers = []
  }

  /** Everything this put on the page. The watcher and the deadline went by effects of their own. */
  private destroy(): void {
    this.destroyLayers()
    this.message?.destroy()
    this.message = undefined
    this.close?.destroy()
    this.close = undefined
    this.ring?.destroy()
    this.ring = undefined
  }
}
