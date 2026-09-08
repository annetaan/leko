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
  resolveTarget,
  resolveTargets,
  sameSurface,
  Scrim,
  type Side,
  type Surface,
  surfaceChain,
  union,
  withinSurface,
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
  type Reentrant,
} from './plan.js'
import type { LekoOptions, LekoStep, LekoWorld } from '@annetaan/leko-types'

const DEFAULTS = { padding: 8, radius: 8, duration: 320 } as const

const NEXT_LABEL = 'Next'

/**
 * How long a target that is not on the page is given to turn up — about six
 * frames. `onEnter` returns synchronously and a framework paints at least a
 * frame after that, so a target the application is rendering right now lands
 * well inside this. Nothing is redrawn while it runs, so the window costs the
 * viewer nothing.
 *
 * For the gap between a step arriving and its target existing, and for nothing
 * else. A wait the application knows it is having is a step of its own —
 * DESIGN.md, **A step that waits**.
 */
const RETRY = 100

/**
 * One hole of a step, as the page answered for it. A {@link Cutout} is this
 * with a box; splitting them is what lets one draw ask the page where its
 * targets are once and hand the answer to every reader. It holds `Element`s, so
 * it cannot live in `plan.ts`, which is pure.
 *
 * The non-empty tuple is what lets `union` answer with a box rather than with a
 * `null` no hole could produce.
 */
interface Hole {
  elements: [Element, ...Element[]]
  interactive: boolean
}

const hole = (elements: Element[], interactive: boolean): Hole | null => {
  const [head, ...rest] = elements
  return head === undefined ? null : { elements: [head, ...rest], interactive }
}

/**
 * The layers a draw is going into, and the step's holes in each space that draw
 * reads them in.
 *
 * The two box lists differ by a translation, so only one of them is a question
 * for the page: {@link onScreen} is the answer and {@link resolved} is the
 * arithmetic on it. Both are kept because the readers differ — a hole is cut in
 * the scrim's own coordinates, and which side of it has room is a fact about
 * the screen.
 */
interface Measured {
  inner: Scrim
  holes: Hole[]
  resolved: Cutout[]
  onScreen: Cutout[]
}

/** The one question a draw puts to the page about where something is. */
const screenBox = (el: Element): Rect => el.getBoundingClientRect()

/**
 * Everything in the region a step opened, or nothing where it opened none — the
 * ring's first segment. A step that shows a hole without opening it has nothing
 * here, so Tab has nowhere to be but Leko's own chrome.
 */
const openElements = (holes: readonly Hole[] | null): Element[] => {
  const first = holes?.[0]
  return first?.interactive ? first.elements : []
}

/**
 * Every element of the hole the step is about, `anchor` first — what a scroll
 * brings in. The whole first region rather than `anchor` alone, and later
 * regions not at all. DESIGN.md argues both under **Bringing a target into
 * view**, and `scrolls-into-view.ts` shows them.
 */
const lit = (step: LekoStep, anchor: Element): [Element, ...Element[]] => {
  const [, ...rest] = regionsOf(step.target)[0]?.elements ?? []
  return [anchor, ...resolveTargets(rest)]
}

/**
 * The half of Leko that touches the page: one scrim per surface that carries
 * the target, the hole cut through them, and the message beside it.
 *
 * It decides nothing — not where the tour is, and not where it is itself.
 * `plan.ts` answers an event with the next mode and the effects owed, and this
 * commits the one and performs the others. The two things noticed here on its
 * own — a target that has not turned up yet turning up, and the window
 * resizing — are reported back through {@link Host} rather than acted on.
 */
export class DomPresenter implements Presenter<LekoWorld> {
  /** Written by {@link dispatch} and nothing else, and read by nothing here but the plan. */
  #mode: Mode = idle
  private readonly options: LekoOptions
  private readonly host: Host<LekoWorld>
  /** One scrim per surface carrying the target, innermost first. DESIGN.md, **Scrolling**. */
  private layers: Scrim[] = []
  /**
   * Outlives the scrims on purpose. A step in a different scroller rebuilds the
   * stack, and the box holding the instruction should not blink while it does.
   */
  private message: Message | undefined
  /**
   * Outlives the scrims and the message, and more so: it is the one thing that
   * must never blink, because it is what somebody reaches for when the page
   * stops behaving.
   */
  private close: Close | undefined
  /**
   * The ring Tab cannot leave while anything is drawn. The blocking rectangles
   * do nothing at all about a key, so without this the same element is one Tab
   * away.
   */
  private ring: FocusRing | undefined
  private onViewportChange: (() => void) | undefined
  /**
   * The one observer this owns, and it hunts: armed only while a target the
   * tour is arriving at has not turned up, by effect, so no hunt can be left
   * running behind another.
   */
  private watcher: MutationObserver | undefined
  /**
   * The clock on a retry, while one runs. Which wait it is for is the mode's
   * `pending`; this is the handle the page handed back, held here because a
   * pure plan cannot make one.
   */
  private deadline: ReturnType<typeof setTimeout> | undefined

  constructor(options: LekoOptions, host: Host<LekoWorld>) {
    this.options = options
    this.host = host
  }

  // -------------------------------------------------------------- what a step asks

  private setting(step: LekoStep, key: 'padding' | 'radius'): number {
    return step[key] ?? this.options[key] ?? DEFAULTS[key]
  }

  /** How long a morph runs. The scroll before it follows the same number. */
  private duration(): number {
    return this.options.duration ?? DEFAULTS.duration
  }

  /**
   * Whether this step brings its target into view before it is drawn. **Off
   * unless somebody asks** — DESIGN.md, **Bringing a target into view**.
   */
  private scrolls(step: LekoStep): boolean {
    return step.scroll ?? this.options.scroll ?? false
  }

  resolve(step: LekoStep): Element | null {
    const action = actionTarget(step.target)
    return action === undefined ? null : resolveTarget(action)
  }

  /**
   * Where the step's regions are on the page — the one time a draw asks.
   *
   * `null` where the step points at something and its first region resolved to
   * nothing: that region is the one the step is about, and a step with nothing
   * to point at is not drawn at all. A later region that resolves to nothing is
   * a hole this step does not cut, and nothing else follows from it.
   *
   * `anchor` is the first element of the first region, already resolved, so it
   * heads that region rather than being resolved twice — the rule {@link lit}
   * follows. `null` there asks the page for every element.
   */
  private holes(step: LekoStep, anchor: Element | null): Hole[] | null {
    const regions = regionsOf(step.target)
    // A step that names nothing cuts nothing, and a scrim with no holes in it
    // is one rectangle over everything. That is the whole of what a step that
    // waits looks like, so it is the empty list rather than the `null` below.
    if (regions.length === 0) return []
    const cut = regions.map((region, i) =>
      hole(
        i === 0 && anchor
          ? [anchor, ...resolveTargets(region.elements.slice(1))]
          : resolveTargets(region.elements),
        region.interactive,
      ),
    )
    if (!cut[0]) return null
    return cut.filter((h): h is Hole => h !== null)
  }

  /**
   * Those holes as cutouts, on screen — the one time a draw reads a box. The
   * scrim wants the same shapes in its own content coordinates, and that is
   * {@link withinSurface} on this rather than a second question for the page.
   */
  private cutouts(step: LekoStep, holes: readonly Hole[]): Cutout[] {
    const padding = this.setting(step, 'padding')
    const radius = this.setting(step, 'radius')
    // One box per hole. A hole is unioned because the space between its
    // elements is meant to be inside it with them. Two holes stay apart because
    // the union of two distant ones would cover everything between them, which
    // is a hole the size of the page.
    return holes.map(({ elements: [head, ...rest], interactive }) => ({
      ...grow(union([screenBox(head), ...rest.map(screenBox)]), padding),
      radius,
      // Open only where the region asked, which the type allows of the first
      // alone. DESIGN.md, **A hole, and whether it is open**.
      interactive,
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
   * step is drawn from is read off the page as it ends up. A redraw goes
   * through {@link reveal} and must not scroll again, the viewer having had
   * every right to move the page since.
   *
   * `undefined` from `bringIntoView` means there was nothing to wait for — the
   * delta decides, and DESIGN.md has when it is zero under **Bringing a target
   * into view**. A glide means the page is moving, and its landing comes back
   * as its own event, with the target resolved again where the page stopped. An
   * abandoned glide never settles, so a landing is always about a glide that
   * was left to run.
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
   * finds is the mode as the event left it. `last` goes last, so nothing here
   * runs against a mode a nested dispatch has replaced — `Reentrant` says why.
   */
  private dispatch(event: Event): void {
    const outcome = reduce(this.#mode, event)
    this.#mode = outcome.mode
    for (const effect of outcome.effects) this.perform(effect)
    if (outcome.last) this.perform(outcome.last)
  }

  /** Make one change to the page. What the page answers comes back as an event. */
  private perform(effect: Effect | Reentrant): void {
    switch (effect.kind) {
      case 'abandon':
        return effect.glide.abandon()
      case 'hide':
        return this.message?.hide()
      case 'disarm':
        return this.disarm()
      case 'hunt':
        return this.hunt(effect.step)
      case 'deadline': {
        const { pending } = effect
        this.cancel()
        // Resolved here rather than trusted to the hunt: a target can turn up
        // without a mutation the observer hears. Whether that makes the wait an
        // arrival or an ending is the plan's.
        this.deadline = setTimeout(
          () => this.dispatch({ kind: 'expired', pending, found: this.resolve(pending.step) }),
          RETRY,
        )
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
   * The layers under `anchor`, `holes` cut in the innermost, and the boxes to
   * draw them at in both spaces. Every draw and every redraw comes through
   * here, so the sequence is written once. `undefined` where there was nothing
   * to measure, and what that means is the caller's.
   *
   * `holes` is the caller's because the caller has other readers for them.
   * `null` is a step that points at something not on the page, which is nothing
   * to measure the same way a missing surface is.
   */
  private measure(
    step: LekoStep,
    anchor: Element | null,
    holes: Hole[] | null,
  ): Measured | undefined {
    const chain = surfaceChain(anchor ?? document.body)
    const inner = this.restack(chain)
    if (!inner || !holes) return undefined
    // One read per element, and one of the surface for all of them.
    const onScreen = this.cutouts(step, holes)
    const resolved = withinSurface(inner.surface, onScreen)
    // These holes move only when layout does, never when something scrolls.
    this.cutOuterLayers(chain)
    return { inner, holes, resolved, onScreen }
  }

  /**
   * The way out and the ring, where the holes are now. The words are {@link say}'s.
   *
   * Placed from no holes at all where the step's target is not on the page,
   * which can put the way out over the hole standing there; a corner the viewer
   * can reach beats one a resize took off screen.
   *
   * `onScreen` is what a caller that has just measured these holes hands over.
   * It is a default rather than a branch: nothing here chooses between
   * measuring afresh and reusing.
   */
  private place(step: LekoStep, holes: Hole[] | null, onScreen?: readonly Cutout[]): void {
    this.showClose(onScreen ?? (holes ? this.cutouts(step, holes) : []))
    this.showRing(holes)
  }

  private reveal(drawn: Drawn, anchor: Element | null, animate: boolean): void {
    const { step } = drawn
    // The step being left is over, so its words go. Nothing is painted between
    // here and the morph below, so this is the same moment the arrival began.
    this.message?.hide()
    const holes = this.holes(step, anchor)
    const measured = this.measure(step, anchor, holes)
    // The anchor resolved a moment ago in this same task, so this is not
    // reached. Kept as the last line of defence, and it says what happened
    // rather than guessing what it means.
    if (!measured) return this.dispatch({ kind: 'unmeasured', step, animate })
    const { inner, resolved } = measured

    // The opening — DESIGN.md, **A story opens by converging, from every hole
    // stretched over the whole surface**. The morph below re-blocks in the same
    // task, so no frame carries the opening's blocking.
    if (!animate) inner.converge(resolved)

    // Before the morph, not after it: the scrim blocks the page from the moment
    // it is set, and one morph is long enough to matter. The ring too — the
    // message is away for the whole of it and the target is already reachable.
    //
    // Placed from the boxes measured a moment ago in this same task. Converging
    // wrote a mask and moved nothing on the page.
    this.place(step, holes, measured.onScreen)

    // The message went when the last step did, and comes back once the cutout
    // has arrived. The side with room is a fact about where the hole ends up,
    // so there is nowhere honest to put it while one is on its way.
    const morphing = inner.morph(resolved, this.duration())
    if (!morphing) return this.dispatch({ kind: 'morphed', step })
    void morphing.then((finished) => {
      if (finished) this.dispatch({ kind: 'morphed', step })
    })
  }

  /**
   * The `replace` effect, performed — what it means is `Effect` in `plan.ts`.
   * Replaying the opening instead would blow the cutout back up to the size of
   * the page and converge again, so for a moment almost nothing would be
   * dimmed. This sets.
   */
  private replace(drawn: Drawn, saying: boolean): void {
    const { step } = drawn
    // A step whose target is not on the page this instant has no surface to put
    // layers under, and restacking against the document would destroy the
    // layers the standing hole and its blocking rectangles live in, leaving the
    // page dimmed with nothing held back. So the layers standing are kept and
    // told the surface moved: without that they keep the size they had and the
    // part the page grew by is neither dimmed nor blocked for the rest of the
    // step. Nothing is drawn for a retry, so no words either — they would be
    // said beside holes that could not be found. The way out is placed all the
    // same.
    const anchor = this.resolve(step)
    if (!anchor && pointsAt(step)) {
      for (const layer of this.layers) layer.resize()
      return this.place(step, this.holes(step, null))
    }
    const holes = this.holes(step, anchor)
    const measured = this.measure(step, anchor, holes)
    if (!measured) return this.place(step, holes)
    measured.inner.set(measured.resolved)
    // Said from what was just measured. Nothing between here and there moves
    // the page.
    if (saying) return this.say(step, drawn.error, measured)
    this.place(step, holes, measured.onScreen)
  }

  /**
   * The side is chosen from viewport coordinates, because what decides it is
   * how much room is on screen right now. The anchor point is written in the
   * scrim's coordinates, because that is the space the scroller carries — and
   * once it is written, the browser holds the message beside it through every
   * scroll that follows, with no script involved.
   *
   * `measured` is what a caller that has just measured these holes hands over.
   * The `say` after a morph passes none — that is a task later, and the hole is
   * somewhere else by then, which is the whole reason the words waited for it.
   */
  private say(step: LekoStep, error: string | undefined, measured?: Measured): void {
    const content = this.content(step, error)
    const holes = measured?.holes ?? this.holes(step, null)
    const onScreen = measured?.onScreen ?? (holes ? this.cutouts(step, holes) : [])
    this.showClose(onScreen)
    if (!content.text && !content.error && !content.next) {
      this.message?.hide()
      this.showRing(holes)
      return
    }
    this.message ??= new Message(() => this.host.next())
    const gap = this.setting(step, 'padding')
    const inner = this.layers[0]
    // The scrim's space, from the boxes just read on screen. Absent where there
    // is no scrim, and where there are no holes to put in one.
    const within =
      measured?.resolved ?? (inner && holes ? withinSurface(inner.surface, onScreen) : undefined)
    const box = within && union(within)
    this.message.show(
      content,
      onScreen,
      gap,
      // Absent where there is no scrim to hang the anchor in, which is what
      // makes the box dock instead.
      inner && box ? (side) => inner.anchorAt(...DomPresenter.edge(box, side)) : undefined,
    )
    // Last, so the next control is showing by the time the ring is asked
    // whether the message is a stop.
    this.showRing(holes)
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
   * **Which steps have a next control is derived here, and nowhere else.** The
   * machine holds the rule as well — a press on such a step moves nothing — but
   * that is a different job: this decides whether to draw, the machine decides
   * whether to move. DESIGN.md argues it under **The next control**.
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
   * The midpoint of one edge of `box`, which is where the message's anchor
   * goes. The edge rather than the middle: the anchor has no area, so
   * `position-area` lays the box out from this point alone, and a point in the
   * middle of the hole would put the message over half of it.
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
   * Put the way out where no cutout covers it. Made the first time anything is
   * drawn rather than when the run starts, because until something is drawn
   * nothing is blocked and there is nothing to get out of. Placed again on
   * every step and every resize, so a hole that moves into the corner it was in
   * pushes it to another.
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
   * Say what Tab may reach, now — called wherever the chrome or the step
   * changes, because every one of those moves a stop.
   *
   * The message goes in whether or not it is showing. A hidden one has nothing
   * Tab would land on, so `FocusRing` drops it, and a step with no next control
   * on its message drops out the same way.
   */
  private showRing(holes: Hole[] | null): void {
    this.ring ??= new FocusRing()
    this.ring.set([
      openElements(holes),
      this.message ? [this.message.element] : [],
      this.close ? [this.close.element] : [],
    ])
  }

  /**
   * The stack that carries `chain`, measured against the surface as it is now,
   * made afresh where the one standing is for other surfaces, and answered
   * innermost first.
   *
   * A layer rides what its target rides. A target moves from one surface to
   * another when the tour moves to a step in a different set of scrollers, and
   * without the tour moving at all: a breakpoint that pins a header takes it
   * off the document and gives it to the viewport, and a document layer left
   * under it carries the hole away on the next scroll while the header stays.
   * Rebuilding is not a morph, so it happens outright rather than half-way.
   *
   * A stack kept is measured again, because the surface can have changed size
   * while nothing was drawn — nothing is drawn for a retry, so a resize that
   * lands while a target is missing is not acted on then, and the step drawn
   * afterwards would otherwise go into layers sized for a page that has since
   * grown. Every caller here is already reading layout, so the measurement
   * costs nothing it was not paying.
   *
   * Nothing here touches the hunt. A `replace` can land while a retry runs, and
   * what the hunt is looking for is a fact about the step rather than about the
   * surfaces under it.
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
      // Only the innermost is haloed — DESIGN.md, **The halo**.
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
      layer.set([{ ...paddingBoxWithin(nested.element, layer.surface), radius, interactive: true }])
    })
  }

  // ---------------------------------------------------------------------- hunting

  /**
   * Arm the one observer on the whole document, hunting for `step`'s target.
   *
   * The step is resolved again on every batch rather than any node being
   * re-checked: what is being waited for does not exist yet, so there is
   * nothing to hold on to, and running the step's own question is the only
   * thing that can answer it. A `target` given as a function that captured an
   * element has no question to run again, so a hunt for it waits out the
   * deadline for nothing — `target-not-there-yet.ts` shows it.
   *
   * Mutations are heard rather than polled, so this stays off the frame budget.
   */
  private hunt(step: LekoStep): void {
    this.disarm()
    this.watcher = new MutationObserver(() => {
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
   * placed, not replayed. Scrolling is not listened for: the scrim sits inside
   * whatever scrolls, so it moves with the target on its own, and the one drawn
   * for a fixed target is fixed itself. DESIGN.md, **Scrolling**.
   */
  private watchViewport(): void {
    this.onViewportChange = () => this.dispatch({ kind: 'resized' })
    window.addEventListener('resize', this.onViewportChange)
  }

  // ------------------------------------------------------------------ taking down

  /**
   * The scrims and the resize listener that redraws them. The message outlives
   * this, and so does a hunt: rebuilding the stack under a hunt changes nothing
   * about the question it is asking.
   */
  private destroyLayers(): void {
    if (this.onViewportChange) {
      window.removeEventListener('resize', this.onViewportChange)
      this.onViewportChange = undefined
    }
    for (const layer of this.layers) layer.destroy()
    this.layers = []
  }

  /** Everything this put on the page. The hunt and the deadline went by effects of their own. */
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
