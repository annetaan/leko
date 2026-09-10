import type { Host, Presenter } from '@annetaan/leko-machine'
import {
  bringIntoView,
  chainOf,
  chromeInsets,
  Close,
  type Cutout,
  ease,
  type Easing,
  FocusRing,
  grow,
  inset,
  Message,
  type MessageContent,
  paddingBoxWithin,
  portsOf,
  type Rect,
  resolveTarget,
  resolveTargets,
  sameSurface,
  Scrim,
  type ScrollMode,
  type Surface,
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
  reduce,
  regionsOf,
  type Reentrant,
} from './plan.js'
import type { LekoOptions, LekoStep, LekoWorld } from '@annetaan/leko-types'

const DEFAULTS = { padding: 8, radius: 8, duration: 320, easing: ease } as const

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
  /** Where the host said its own chrome is, on screen — {@link DomPresenter.chromeBoxes}. */
  chrome: Rect[]
  /** The viewport with those boxes taken off it, which is where the message may go. */
  room: Rect
  /** The visible box in `inner`'s space, for the opening; read here so that `converge` writes only. */
  seen: Rect
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

  /** The curve a morph and the scroll before it are both eased by. */
  private easing(): Easing {
    return this.options.easing ?? DEFAULTS.easing
  }

  /**
   * How this step brings its target into view, or nothing where it does not.
   * **Off unless somebody asks** — DESIGN.md, **Bringing a target into view**.
   */
  private scrolls(step: LekoStep): ScrollMode | undefined {
    const asked = step.scroll ?? this.options.scroll ?? false
    if (asked === false) return undefined
    return asked === true ? 'direct' : asked
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
   * `anchor` is what the page has already answered for the first element of the
   * first region, and it has three states: an `Element` heads that region
   * rather than being resolved twice — the rule {@link lit} follows — `null`
   * says the page was asked and it has gone, and `undefined` says nobody has
   * asked, so every element is put to the page here. The middle one is what
   * keeps a caller that resolved the anchor itself from asking twice for an
   * answer it already has.
   */
  private holes(step: LekoStep, anchor: Element | null | undefined): Hole[] | null {
    const regions = regionsOf(step.target)
    // A step that names nothing cuts nothing, and a scrim with no holes in it
    // is one rectangle over everything. That is the whole of what a step that
    // waits looks like, so it is the empty list rather than the `null` below.
    if (regions.length === 0) return []
    const cut = regions.map((region, i) =>
      hole(
        i === 0 && anchor !== undefined
          ? [...(anchor ? [anchor] : []), ...resolveTargets(region.elements.slice(1))]
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

  /**
   * Where the host's own chrome is, now — one read per element it named, and
   * none where it named nothing. DESIGN.md, **A host's own chrome is named
   * once, and every reader takes the boxes**.
   */
  private chromeBoxes(): Rect[] {
    const named = this.options.hostChrome
    if (named === undefined) return []
    return resolveTargets(Array.isArray(named) ? named : [named]).map(screenBox)
  }

  /**
   * The part of the page left for what Leko draws.
   *
   * **The layout viewport, not `innerWidth` and `innerHeight`.** Everything
   * placed from this is `position: fixed`, so it is laid out against the
   * initial containing block, which is `clientWidth` and `clientHeight` on the
   * root with the scrollbar gutter taken off — and the boxes it is compared
   * against came from `getBoundingClientRect`, which is in that same space. The
   * scrim goes the other way and is sized past it on purpose: DESIGN.md, **That
   * layer is sized past the layout viewport on purpose, gutter included**.
   */
  private static roomIn(chrome: readonly Rect[]): Rect {
    const root = document.documentElement
    const viewport = { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight }
    return inset(viewport, chromeInsets(viewport.width, viewport.height, chrome))
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
    const mode = this.scrolls(step)
    const glide =
      anchor && mode
        ? bringIntoView(
            lit(step, anchor),
            this.setting(step, 'padding'),
            this.duration(),
            mode,
            this.easing(),
          )
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
        // What the page answers goes into the event as data, and `plan.ts`
        // decides on it there.
        return this.dispatch({
          kind: 'resolved',
          drawn: effect.drawn,
          saying: effect.saying,
          found: this.resolve(effect.drawn.step),
        })
      case 'redraw':
        return this.redraw(effect.drawn, effect.anchor, effect.saying)
      case 'refit':
        return this.refit(effect.drawn.step)
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
   * here, so the sequence is written once: the layers are mounted, then every
   * box is read, then every layer is written — DESIGN.md, **A draw mounts its
   * layers, then reads, then writes**. `undefined` where there was nothing to
   * measure, and what that means is the caller's.
   *
   * A stack kept is measured again, because the surface can have changed size
   * while nothing was drawn — DESIGN.md, **Nothing is drawn for a retry** — and
   * the step drawn afterwards would otherwise go into layers sized for a page
   * that has since grown.
   *
   * `holes` is the caller's because the caller has other readers for them.
   * `null` is a step that points at something not on the page, which is nothing
   * to measure the same way a missing surface is.
   *
   * **The one place the follow is armed, and the one place it is taken down**
   * — DESIGN.md, **A sticky target's hole is corrected on a frame loop, and
   * that is the only exception to the ban**. Down on the way in, so no way out
   * of here leaves a loop asking about the step before; up at the end, where
   * the boxes it will be correcting have just been written, and only for a
   * target the page can move out from under them. `refit` is the one other
   * caller and takes it down itself, having no draw to arm it with.
   */
  private measure(
    step: LekoStep,
    anchor: Element | null,
    holes: Hole[] | null,
  ): Measured | undefined {
    this.layers[0]?.follow(undefined)
    const { surfaces: chain, sticky } = chainOf(anchor ?? document.body)
    const inner = this.stack(chain)
    if (!inner) return undefined
    if (!holes) {
      this.fit()
      return undefined
    }
    for (const layer of this.layers) layer.measure()
    // One read per element, and one of the surface for all of them.
    const onScreen = this.cutouts(step, holes)
    const resolved = withinSurface(inner.surface, onScreen)
    const chrome = this.chromeBoxes()
    const seen = inner.seen()
    const outer = this.outerHoles(chain)
    for (const layer of this.layers) layer.resize()
    this.cutOuterLayers(outer)
    if (sticky && holes.length > 0) {
      inner.follow(() => this.holesNow(step, holes, inner), portsOf(chain))
    }
    return { inner, holes, resolved, onScreen, chrome, room: DomPresenter.roomIn(chrome), seen }
  }

  /**
   * Where this step's holes are on screen right now, in the innermost layer's
   * own space — the question a frame of the follow puts to the page, and the
   * same two lines {@link measure} asks in its read pass.
   *
   * `undefined` where the target has left the page, which is what stops the
   * loop. The elements are asked rather than the step's `target` resolved
   * again: a hole is the elements the draw found, and a step is not re-resolved
   * between draws.
   */
  private holesNow(step: LekoStep, holes: readonly Hole[], inner: Scrim): Cutout[] | undefined {
    const gone = holes.some(({ elements }) => elements.some((el) => !el.isConnected))
    if (gone) return undefined
    return withinSurface(inner.surface, this.cutouts(step, holes))
  }

  /** Size every standing layer to its surface as it is now. Reads all, then writes all. */
  private fit(): void {
    for (const layer of this.layers) layer.measure()
    for (const layer of this.layers) layer.resize()
  }

  /**
   * The way out and the ring, where the holes are now. The words are {@link say}'s.
   *
   * Placed from no holes at all where the step's target is not on the page,
   * which can put the way out over the hole standing there; a corner the viewer
   * can reach beats one a resize took off screen.
   *
   * `measured` is what a caller that has just measured these holes hands over.
   * It is a default rather than a branch: nothing here chooses between
   * measuring afresh and reusing.
   *
   * The corner dodges the host's own chrome along with the holes: both are
   * boxes the way out may not cover, and `freeCorner` never had to tell them
   * apart.
   */
  private place(step: LekoStep, holes: Hole[] | null, measured?: Measured): void {
    const onScreen = measured?.onScreen ?? (holes ? this.cutouts(step, holes) : [])
    this.showClose([...onScreen, ...(measured?.chrome ?? this.chromeBoxes())])
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
    if (!animate) inner.converge(resolved, measured.seen)

    // Before the morph, not after it: the scrim blocks the page from the moment
    // it is set, and one morph is long enough to matter. The ring too — the
    // message is away for the whole of it and the target is already reachable.
    //
    // Placed from the boxes measured a moment ago in this same task. Converging
    // wrote a mask and moved nothing on the page.
    this.place(step, holes, measured)

    // The message went when the last step did, and comes back once the cutout
    // has arrived. The side with room is a fact about where the hole ends up,
    // so there is nowhere honest to put it while one is on its way.
    const morphing = inner.morph(resolved, this.duration(), this.easing())
    if (!morphing) return this.dispatch({ kind: 'morphed', step })
    void morphing.then((finished) => {
      if (finished) this.dispatch({ kind: 'morphed', step })
    })
  }

  /**
   * The `redraw` effect, performed — what it means is `Effect` in `plan.ts`.
   * Replaying the opening instead would blow the cutout back up to the size of
   * the page and converge again, so for a moment almost nothing would be
   * dimmed. This sets.
   */
  private redraw(drawn: Drawn, anchor: Element | null, saying: boolean): void {
    const { step } = drawn
    const holes = this.holes(step, anchor)
    const measured = this.measure(step, anchor, holes)
    // The same exit {@link reveal} has, and not reached from either way in
    // here: an anchor resolved a moment ago in this same task has a box, and a
    // step that points at nothing arrives with holes of `[]` rather than
    // `null`, onto a surface chain that always answers with the document.
    // `../model/README.md` says so under **What it does not cover**.
    if (!measured) return this.place(step, holes)
    measured.inner.set(measured.resolved)
    // Said from what was just measured. Nothing between here and there moves
    // the page.
    if (saying) return this.say(step, drawn.error, measured)
    this.place(step, holes, measured)
  }

  /**
   * The `refit` effect, performed: the layers standing are kept and told the
   * surface moved. Without that they keep the size they had, and the part the
   * page grew by is neither dimmed nor blocked for the rest of the step.
   *
   * Nothing is cut, because the target the holes belong to has gone — which is
   * what `plan.ts` decided on, and where it says why the layers are not
   * restacked. `null` carries that answer down, so the first element is not
   * asked for a second time.
   */
  private refit(step: LekoStep): void {
    // The target is gone, so there is nothing left to follow. The loop cannot
    // see this for itself: what has gone is the answer to the step's question,
    // and the elements the last draw found can still be on the page.
    this.layers[0]?.follow(undefined)
    this.fit()
    this.place(step, this.holes(step, null))
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
    const holes = measured?.holes ?? this.holes(step, undefined)
    const onScreen = measured?.onScreen ?? (holes ? this.cutouts(step, holes) : [])
    // Read here as well, because a `say` after a morph is a task later than the
    // draw and brings no measurements of its own.
    const chrome = measured?.chrome ?? this.chromeBoxes()
    this.showClose([...onScreen, ...chrome])
    if (!content.text && !content.error && !content.next) {
      this.message?.hide()
      this.showRing(holes)
      return
    }
    this.message ??= new Message(() => this.host.next())
    const gap = this.setting(step, 'padding')
    const inner = this.layers[0]
    this.message.show(
      content,
      onScreen,
      gap,
      measured?.room ?? DomPresenter.roomIn(chrome),
      // The side, and never the point: the scrim holds the holes the point is
      // taken from, so a hole a follow moves takes the marker with it.
      // Absent where there is no scrim to hang the anchor in, or no hole to
      // hang it off, which is what makes the box dock instead.
      inner && holes?.length ? (side) => inner.anchorTo(side) : undefined,
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
   * The stack that carries `chain`: the one standing where it is for these
   * surfaces, made afresh where it is not, and answered innermost first. Mounted
   * and nothing more — no layer is sized or cut here, because a layer mounted
   * on a static scroller gives it a `position`, and everything a draw reads is
   * read after that. {@link measure} is the order.
   *
   * A layer rides what its target rides. A target moves from one surface to
   * another when the tour moves to a step in a different set of scrollers, and
   * without the tour moving at all: a breakpoint that pins a header takes it
   * off the document and gives it to the viewport, and a document layer left
   * under it carries the hole away on the next scroll while the header stays.
   * Rebuilding is not a morph, so it happens outright rather than half-way.
   *
   * Nothing here touches the hunt. A `replace` can land while a retry runs, and
   * what the hunt is looking for is a fact about the step rather than about the
   * surfaces under it.
   */
  private stack(chain: Surface[]): Scrim | undefined {
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
    }
    return this.layers[0]
  }

  /**
   * The hole each outer layer is cut to: the scroller nested inside it. Every
   * surface with a layer outside it is a scroller — the document and the
   * viewport are each the last of a chain — so `undefined` is a layer that is
   * not outer. These holes move only when layout does, never when something
   * scrolls. Reads only; {@link cutOuterLayers} writes them.
   */
  private outerHoles(chain: Surface[]): (Cutout | undefined)[] {
    return this.layers.slice(1).map((layer, i) => {
      const nested = chain[i]
      // Either kind of layer inside a scroller: one riding its content, or one
      // glued to its scrollport. Both live in that panel, and an outer layer
      // that did not cut a hole for them would dim it twice over.
      if (nested === undefined) return undefined
      if (nested.kind !== 'scroller' && nested.kind !== 'glued') return undefined
      // Match the scroller's own rounding, or its corners show through the hole.
      const radius = parseFloat(getComputedStyle(nested.element).borderTopLeftRadius) || 0
      // Always interactive. This hole is where the scrim below it lives, and a
      // rectangle over it would block that whole scroller, cutouts and all.
      return { ...paddingBoxWithin(nested.element, layer.surface), radius, interactive: true }
    })
  }

  private cutOuterLayers(holes: readonly (Cutout | undefined)[]): void {
    this.layers.slice(1).forEach((layer, i) => {
      const cut = holes[i]
      if (cut) layer.set([cut])
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
