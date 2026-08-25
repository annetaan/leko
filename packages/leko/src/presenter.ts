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
  union,
} from '@annetaan/leko-spotlight'
import type { LekoOptions, LekoStep, LekoStory, LekoTarget } from './types.js'

const DEFAULTS = { padding: 8, radius: 8, duration: 320, curtain: 250 } as const

/**
 * How long the curtain stays once it is down, whatever the arrival does.
 *
 * A threshold has a band just above it: cross at 250ms with an arrival that
 * ends at 300ms and the curtain is up for 50ms, which reads as a fault rather
 * than as waiting. An arrival landing inside this waits it out.
 */
const CURTAIN_MINIMUM = 400

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
export class DomPresenter implements Presenter<HTMLElement, LekoStep, LekoStory> {
  private readonly options: LekoOptions
  private readonly host: Host<LekoStep>
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
  /** The arrival that has not become a curtain yet, if one is waiting. */
  private waiting: ReturnType<typeof setTimeout> | undefined
  /** The frame the curtain is waiting to be painted in, if it is. */
  private painting: number | undefined
  /**
   * When the curtain was first painted, which is when the minimum starts.
   *
   * Not when it was set. A step that declares `curtain: true` and hands back
   * nothing has its curtain set and replaced inside one task, so no frame ever
   * carries it, and there is nothing for a minimum to protect anybody from.
   */
  private since: number | undefined

  constructor(options: LekoOptions, host: Host<LekoStep>) {
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
    if (this.since !== undefined || this.painting !== undefined) return
    const after = this.curtainAfter(story, step)
    if (after === false) return
    clearTimeout(this.waiting)
    // Straight through where nothing is being waited for. `setTimeout(fn, 0)`
    // is still a task away, and a step that says it is slow should not spend
    // one of those with the page open.
    if (after === 0) return this.drawCurtain(story)
    this.waiting = setTimeout(() => this.drawCurtain(story), after)
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
  private drawCurtain(story: LekoStory): void {
    this.waiting = undefined
    if (this.layers.length === 0) {
      this.layers = [new Scrim(null)]
      this.watchViewport()
    }
    // Cut rather than morphed. The curtain only appears for an arrival already
    // slow enough to have crossed the delay, and spending another 320ms closing
    // the hole would add to a wait that is the problem in the first place.
    this.layers[0]?.set([])
    for (const layer of this.layers.slice(1)) layer.set([])
    this.painting = requestAnimationFrame(() => {
      this.painting = undefined
      this.since = performance.now()
    })
    this.showClose([])
    if (this.options.curtainLabel !== undefined) {
      this.message ??= new Message(() => this.host.next())
      this.message.show(
        { text: this.options.curtainLabel, error: undefined, next: undefined },
        undefined,
        [],
        this.setting(story, story.steps[0]!, 'padding'),
      )
    }
  }

  /**
   * How long the curtain still owes the viewer, and the end of it either way.
   *
   * Called once per arrival, from {@link show}, because it clears the mark it
   * measures against.
   */
  private lift(): number {
    clearTimeout(this.waiting)
    this.waiting = undefined
    if (this.painting !== undefined) {
      cancelAnimationFrame(this.painting)
      this.painting = undefined
    }
    if (this.since === undefined) return 0
    const left = CURTAIN_MINIMUM - (performance.now() - this.since)
    this.since = undefined
    return Math.max(0, left)
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
   * Measured in viewport coordinates and only at step boundaries: the side is
   * chosen from what is on screen now, and the browser holds the message there
   * through every scroll that follows.
   */
  private say(story: LekoStory, step: LekoStep, action: HTMLElement, content: Content): void {
    const onScreen = this.cutouts(story, step, (el) => el.getBoundingClientRect())
    this.showClose(onScreen?.cutouts ?? [])
    if (!content.text && !content.error && !content.next) {
      this.message?.hide()
      return
    }
    this.message ??= new Message(() => this.host.next())
    const gap = this.setting(story, step, 'padding')
    this.message.show(content, action, onScreen?.cutouts ?? [], gap)
  }

  /**
   * Put the way out where no cutout covers it.
   *
   * Made the first time anything is drawn rather than when the run starts,
   * because until something is drawn nothing is blocked and there is nothing to
   * get out of. Placed again on every step and every resize, so a hole that
   * moves into the corner it was in pushes it to another.
   *
   * `close: false` is a host saying it has its own way out. Nothing is drawn
   * then, and the scrim goes on blocking the page, which is that host's to
   * answer for.
   */
  private showClose(cutouts: readonly Rect[]): void {
    if (this.options.close === false) return
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
    anchor: HTMLElement,
    content: Content,
    animate: boolean,
  ): Promise<void> | void {
    // The curtain is what the hole opens out of when there was one. Blowing the
    // scrim up to a hole larger than the page first, which is how a tour that
    // has drawn nothing opens, would flash the whole page clear on the way.
    const covered = this.since !== undefined || this.painting !== undefined
    const owed = this.lift()
    if (owed === 0) return this.reveal(story, step, anchor, content, animate || covered)
    return new Promise<void>((settle) => setTimeout(settle, owed)).then(() =>
      this.reveal(story, step, anchor, content, true),
    )
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
    if (!resolved) return this.host.lost(step)

    const inner = this.layers[0]
    if (!inner) return this.host.lost(step)

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
      this.say(story, step, anchor, content)
      return
    }
    // Nothing back where the morph was interrupted. Another one starting is the
    // only thing that interrupts this, and the machine bumped its counter to
    // begin it, so the settlement below is dropped there either way.
    return morphing.then((finished) => {
      if (!finished) return
      this.say(story, step, anchor, content)
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
    if (anchor) this.say(story, step, anchor, content)
  }

  /**
   * Nothing has moved, so a message already on screen only changes its words.
   * Re-placing it would jump the box out from under someone in the middle of
   * reading why they were stopped. A step that had no message until now has
   * nowhere to jump from, so that one is placed properly.
   */
  retell(story: LekoStory, step: LekoStep, anchor: HTMLElement, content: Content): void {
    if (this.message?.visible) {
      this.message.setText(content.text ?? '')
      this.message.setError(content.error ?? '')
      return
    }
    this.say(story, step, anchor, content)
  }

  reject(): void {
    this.layers[0]?.shake()
  }

  hide(): void {
    this.message?.hide()
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
      this.host.lost(step)
    })
    this.watcher.observe(document.body, { childList: true, subtree: true })
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
    clearTimeout(this.waiting)
    this.waiting = undefined
    if (this.painting !== undefined) cancelAnimationFrame(this.painting)
    this.painting = undefined
    this.since = undefined
    this.destroyLayers()
    this.message?.destroy()
    this.message = undefined
    this.close?.destroy()
    this.close = undefined
  }
}
