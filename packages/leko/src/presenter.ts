import type { Content, Host, Presenter } from '@annetaan/leko-machine'
import {
  Close,
  type Cutout,
  findScrollContainer,
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
import { type Curtain, covering, DOWN, onset, owed } from './curtain.js'
import type { LekoOptions, LekoStep, LekoStory, LekoTarget, LekoWorld } from './types.js'

const DEFAULTS = { padding: 8, radius: 8, duration: 320, curtain: 250 } as const

/**
 * How long a target that has left the page is given to come back.
 *
 * Long enough for a route transition, short enough that a tour ending does not
 * read as a hang.
 */
const SEARCH = 2000

const asArray = (value: LekoTarget | LekoTarget[]): LekoTarget[] =>
  Array.isArray(value) ? value : [value]

interface Resolved {
  /** The element `validate` is given: the first of `target`. */
  action: HTMLElement
  cutouts: Cutout[]
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
  private onViewportChange: (() => void) | undefined
  private watcher: MutationObserver | undefined
  /** Where the curtain is. `curtain.ts` says what each state means. */
  private curtain: Curtain = DOWN
  /** The rest of the minimum a curtain still owes, while a step waits it out. */
  private owing: ReturnType<typeof setTimeout> | undefined
  /**
   * The last step handed over, kept so that a target which comes back can be
   * drawn again without the machine being told anything happened.
   */
  private drawn: { story: LekoStory; step: LekoStep; content: Content } | undefined
  /** The deadline on a target that has left the page, while one is running. */
  private searching: ReturnType<typeof setTimeout> | undefined
  /** The step that deadline is about, so a search the tour left can be told. */
  private sought: LekoStep | undefined
  /** Ends the promise a search hands back, whichever way the search went. */
  private settled: (() => void) | undefined

  constructor(options: LekoOptions, host: Host<LekoWorld>) {
    this.options = options
    this.host = host
  }

  /**
   * Step, then story, then instance: the nearest one that says anything wins.
   *
   * The story is handed in rather than read back off the host. It used to come
   * from `host.story`, which is the state half answering a drawing question,
   * and correct only at moments nobody had written down.
   */
  private setting(story: LekoStory, step: LekoStep, key: 'padding' | 'radius'): number {
    return step[key] ?? story[key] ?? this.options[key] ?? DEFAULTS[key]
  }

  /**
   * How long an arrival has to last before the curtain comes down, or `false`
   * where it never does.
   *
   * The same near-to-far read as {@link setting}, with `??` rather than `||` so
   * that a step writing `false` beats an instance writing a number instead of
   * falling through it. A story's own arrival has no step to ask.
   */
  private curtainAfter(story: LekoStory, step: LekoStep | undefined): number | false {
    const said = step?.curtain ?? story.curtain ?? this.options.curtain ?? DEFAULTS.curtain
    if (said === false) return false
    return said === true ? 0 : said
  }

  /**
   * {@link Presenter.hold}. The step being left is over, so its message goes,
   * and the curtain is set going if this arrival is the kind that gets one.
   *
   * Already down stays down. Two arrivals in a row are one window as far as
   * somebody watching is concerned, and dropping it between them would be a
   * flash of the page they are not meant to be using yet.
   */
  hold(story: LekoStory, step: LekoStep | undefined): void {
    this.message?.hide()
    const asked = onset(this.curtain, this.curtainAfter(story, step))
    if (asked.do === 'nothing') return
    if (asked.do === 'paint') return this.drawCurtain(story, step)
    this.lower()
    this.curtain = {
      kind: 'waiting',
      timer: setTimeout(() => this.drawCurtain(story, step), asked.after),
    }
  }

  /** Stop whatever the curtain has running. Which way is the state's to say. */
  private lower(): void {
    const curtain = this.curtain
    if (curtain.kind === 'waiting') clearTimeout(curtain.timer)
    if (curtain.kind === 'painting') cancelAnimationFrame(curtain.frame)
    this.curtain = DOWN
  }

  /**
   * What the curtain says, or `undefined` where nothing anywhere says.
   *
   * The same near-to-far read as {@link setting}, and the instance's is the foot
   * of it rather than a separate thing: a curtain nobody declared is one whose
   * step said nothing, so it falls through to whatever the host would put on any
   * wait of its own. A story's own arrival has no step to ask.
   */
  private curtainLabel(story: LekoStory, step: LekoStep | undefined): string | undefined {
    return step?.curtainLabel ?? story.curtainLabel ?? this.options.curtainLabel
  }

  /**
   * Everything, with no hole in it.
   *
   * `complementRects` with no holes is one rectangle over the whole surface, so
   * this is the empty case of what the scrim does every day rather than a
   * second way of covering things. A story's own arrival has no scrim yet,
   * which is the case where this builds one: `start()` on a story with a slow
   * `onEnter` used to draw nothing at all, so somebody pressed Start, watched
   * nothing happen, and pressed it again.
   */
  private drawCurtain(story: LekoStory, step: LekoStep | undefined): void {
    // A delay that has already fired is stopped again for nothing, and one that
    // has not is a second curtain this one would leak.
    this.lower()
    if (this.layers.length === 0) {
      this.layers = [new Scrim(null)]
      this.watchViewport()
    }
    // Cut rather than morphed. The curtain only appears for an arrival already
    // slow enough to have crossed the delay, and spending another 320ms closing
    // the hole would add to a wait that is the problem in the first place.
    this.layers[0]?.set([])
    for (const layer of this.layers.slice(1)) layer.set([])
    this.curtain = {
      kind: 'painting',
      frame: requestAnimationFrame(() => {
        this.curtain = { kind: 'up', since: performance.now() }
      }),
    }
    this.showClose([])
    const text = this.curtainLabel(story, step)
    if (text !== undefined) {
      this.message ??= new Message(() => this.host.next())
      // No anchor and no cutouts, so the box docks and the gap between it and a
      // hole is a measurement about nothing. Zero rather than a padding read off
      // some step, which is a number this cannot use and had no honest way to
      // pick.
      this.message.show({ text, error: undefined, next: undefined }, [], 0)
    }
  }

  /**
   * How long the curtain still owes the viewer, and the end of it either way.
   *
   * Called once per arrival, from {@link show}, because it clears the mark it
   * measures against.
   */
  private lift(): number {
    const left = owed(this.curtain, performance.now())
    this.lower()
    // A step still waiting out the last curtain is a step nothing is heading
    // for any more. Left running, its timer draws it over whatever this
    // arrival is about to put on screen.
    clearTimeout(this.owing)
    this.owing = undefined
    return left
  }

  resolve(step: LekoStep): HTMLElement | null {
    return resolveTarget(asArray(step.target)[0]!)
  }

  /**
   * The step's cutouts, in whatever space `measure` reports in.
   *
   * The scrim wants them in its own content coordinates; the message wants the
   * same shapes in viewport coordinates, to work out which side of them has room
   * on screen. Same geometry, two readers, so the space is the parameter.
   */
  private cutouts(
    story: LekoStory,
    step: LekoStep,
    measure: (el: HTMLElement) => Rect,
  ): Resolved | null {
    const targets = resolveTargets(asArray(step.target))
    const action = targets[0]
    if (!action) return null

    const padding = this.setting(story, step, 'padding')
    const radius = this.setting(story, step, 'radius')

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
   * Two measurements of the same holes. The side is chosen from viewport
   * coordinates, because what decides it is how much room is on screen right
   * now. The anchor point is written in the scrim's coordinates, because that
   * is the space the scroller carries — and once it is written, the browser
   * holds the message beside it through every scroll that follows, with no
   * script involved.
   */
  private say(story: LekoStory, step: LekoStep, content: Content): void {
    const onScreen = this.cutouts(story, step, (el) => el.getBoundingClientRect())
    this.showClose(onScreen?.cutouts ?? [])
    if (!content.text && !content.error && !content.next) {
      this.message?.hide()
      return
    }
    this.message ??= new Message(() => this.host.next())
    const gap = this.setting(story, step, 'padding')
    const inner = this.layers[0]
    const within = inner && this.cutouts(story, step, (el) => rectWithin(el, inner.container))
    const box = within && union(within.cutouts)
    this.message.show(
      content,
      onScreen?.cutouts ?? [],
      gap,
      // Absent where there is no scrim to hang the anchor in, which is what
      // makes the box dock instead.
      inner && box ? (side) => inner.anchorAt(...DomPresenter.edge(box, side)) : undefined,
    )
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
      layer.set([{ ...paddingBoxWithin(nested, layer.container), radius }])
    })
  }

  show(
    story: LekoStory,
    step: LekoStep,
    anchor: HTMLElement | null,
    content: Content,
    animate: boolean,
  ): Promise<void> | void {
    // A search armed on a step the tour has left. Dropping it here is what
    // keeps a target that comes back late from being drawn over the step now
    // showing, and it is where the machine is told that wait is over.
    if (this.sought !== undefined && this.sought !== step) {
      const stale = this.sought
      this.endSearch()
      this.host.searching(stale, false)
    }
    // Not on the page yet, which a step whose target renders a moment after its
    // `onEnter` settled is as much as one whose target has gone.
    if (!anchor) return this.search(story, step, content)
    // The curtain is what the hole opens out of when there was one. Blowing the
    // scrim up to a hole larger than the page first, which is how a tour that
    // has drawn nothing opens, would flash the whole page clear on the way.
    const covered = covering(this.curtain)
    const left = this.lift()
    if (left === 0) return this.reveal(story, step, anchor, content, animate || covered)
    return new Promise<void>((settle) => {
      this.owing = setTimeout(settle, left)
    }).then(() => this.reveal(story, step, anchor, content, true))
  }

  /** Draw the step. Called once the curtain, if there was one, has paid its dues. */
  private reveal(
    story: LekoStory,
    step: LekoStep,
    anchor: HTMLElement,
    content: Content,
    animate: boolean,
  ): Promise<void> | void {
    const chain = DomPresenter.chainOf(anchor)
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
    const resolved = this.cutouts(story, step, (el) => rectWithin(el, container))
    if (!resolved) return this.search(story, step, content)

    const inner = this.layers[0]
    if (!inner) return this.search(story, step, content)

    // Kept so that a target which comes back can be drawn again without the
    // machine hearing that anything happened.
    this.drawn = { story, step, content }

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

    this.watchTarget(step, anchor)

    // Before the morph, not after it. The scrim blocks the page from the moment
    // it is set, and a page that is blocked with no way out of it is the thing
    // this control exists to prevent, even for the length of one morph.
    this.showClose(this.cutouts(story, step, (el) => el.getBoundingClientRect())?.cutouts ?? [])

    // The message went when the last step did, and comes back once the cutout
    // has arrived. The side with room is a fact about where the hole ends up,
    // so there is nowhere honest to put it while one is on its way.
    const duration = story.duration ?? this.options.duration ?? DEFAULTS.duration
    const morphing = inner.morph(resolved.cutouts, duration)
    if (!morphing) {
      this.say(story, step, content)
      return
    }
    // Nothing back where the morph was interrupted. Another one starting is the
    // only thing that interrupts this, and the machine let go of the promise
    // this call handed back to begin it, so the settlement below is dropped
    // there either way.
    return morphing.then((finished) => {
      if (!finished) return
      this.say(story, step, content)
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
  place(story: LekoStory, step: LekoStep, anchor: HTMLElement | null, content: Content): void {
    const inner = this.layers[0]
    if (!inner) return
    for (const layer of this.layers) layer.resize()
    this.cutOuterLayers(DomPresenter.chainOf(anchor ?? document.body))
    const resolved = this.cutouts(story, step, (el) => rectWithin(el, inner.container))
    if (resolved) inner.set(resolved.cutouts)
    // The message needs no help to follow a scroll, but a resize can leave the
    // side it was put on without room, so that choice is made again.
    if (anchor) this.say(story, step, content)
  }

  /**
   * Nothing has moved, so a message already on screen only changes its words.
   * Re-placing it would jump the box out from under someone in the middle of
   * reading why they were stopped. A step that had no message until now has
   * nowhere to jump from, so that one is placed properly.
   */
  retell(story: LekoStory, step: LekoStep, content: Content): void {
    if (this.message?.visible) {
      this.message.setText(content.text ?? '')
      this.message.setError(content.error ?? '')
      return
    }
    this.say(story, step, content)
  }

  reject(): void {
    this.layers[0]?.shake()
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
      const held = this.drawn
      if (!held) return
      // The batch that disconnected this node usually carries its replacement,
      // and that is the whole of a framework rendering over the step. A search
      // started now would never see it: the mutation that added it has already
      // been delivered, and an observer hears nothing about the past. So the
      // selector is run here, and a re-render costs a morph rather than two
      // seconds of curtain and an ending.
      const back = this.resolve(held.step)
      if (back) return void this.show(held.story, held.step, back, held.content, true)
      this.search(held.story, held.step, held.content)
    })
    this.watcher.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * A target that is not on the page is given time to come back.
   *
   * A framework replacing a node with an identical one disconnects the old one,
   * so a correct application loses its anchor for a frame every time it renders
   * over the step. Ending the tour there is the library punishing an
   * application for working normally.
   *
   * **The target is resolved again rather than the old element re-checked.**
   * `isConnected` on a node that has been replaced is false for ever, and a
   * fresh resolve finds the replacement. A `target` given as an `HTMLElement`
   * has no selector to run again, so it cannot be recovered and this waits out
   * the deadline for nothing.
   *
   * The search rides the same `MutationObserver` that noticed the loss, so it
   * costs no polling: every change to the page is another chance. Found in
   * time, the step is drawn again and nothing about the tour has changed. Not
   * found, `Host.lost` means what it has always meant.
   *
   * Either way the machine is told the wait began, through `Host.searching`,
   * because a wait it did not ask for is one it cannot otherwise see.
   */
  private search(story: LekoStory, step: LekoStep, content: Content): Promise<void> | void {
    if (this.searching !== undefined) return
    // Whatever `curtain` says. That setting is about an arrival, which is a
    // normal wait, and this is not one: a hole standing over nothing for two
    // seconds is the state this search exists to avoid showing anybody.
    this.message?.hide()
    // No step, for the same reason. A step's `curtainLabel` says what its
    // `onEnter` is doing, and that handler finished before this step was ever
    // drawn. Putting those words over a target that has gone missing since
    // would be the curtain saying something untrue about a wait of a different
    // kind, so this falls to whatever the story or the host says generally.
    this.drawCurtain(story, undefined)
    this.watcher?.disconnect()
    this.watcher = new MutationObserver(() => {
      const found = this.resolve(step)
      if (!found) return
      this.endSearch()
      this.host.searching(step, false)
      void this.show(story, step, found, content, true)
    })
    this.watcher.observe(document.body, { childList: true, subtree: true })
    // Handed back, so an arrival that came in here has something to wait on. A
    // tour waiting for a target to turn up is between things in the same way a
    // tour waiting for a morph is.
    const waiting = new Promise<void>((settled) => {
      this.settled = settled
      this.searching = setTimeout(() => {
        this.endSearch()
        this.host.lost(step)
      }, SEARCH)
    })
    // Said whichever way this search was reached, and said last, so the search
    // is fully armed before the machine hears about it.
    this.sought = step
    this.host.searching(step, true)
    return waiting
  }

  private endSearch(): void {
    clearTimeout(this.searching)
    this.searching = undefined
    this.sought = undefined
    this.watcher?.disconnect()
    this.watcher = undefined
    this.settled?.()
    this.settled = undefined
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
    // Every timer this owns goes, including the one a step was waiting out. A
    // tour that has been stopped drawing itself back onto the page 300ms later
    // is the worst of the lot, because nothing is left to take it away again.
    this.lower()
    clearTimeout(this.owing)
    this.owing = undefined
    this.endSearch()
    this.drawn = undefined
    this.destroyLayers()
    this.message?.destroy()
    this.message = undefined
    this.close?.destroy()
    this.close = undefined
  }
}
