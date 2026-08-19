import { type Cutout, grow, type Rect, resolveTarget, resolveTargets, union } from './geometry.js'
import { Message, type MessageContent } from './message.js'
import { findScrollContainer, paddingBoxWithin, rectWithin, Scrim } from './scrim.js'
import type {
  ErrorUtils,
  LekoOptions,
  LekoSignal,
  LekoState,
  LekoStep,
  LekoStory,
  LekoTarget,
} from './types.js'

const DEFAULTS = { padding: 8, radius: 8, duration: 320 } as const

/** What the next control reads until an instance says otherwise. */
const NEXT_LABEL = 'Next'

const asArray = (value: LekoTarget | LekoTarget[]): LekoTarget[] =>
  Array.isArray(value) ? value : [value]

/**
 * Whether `onEnter` handed back something to wait for. Asked of the value
 * rather than trusting the signature, because a JavaScript call site is free to
 * return whatever it likes and `await`ing a number would cost a turn for
 * nothing.
 */
const isThenable = (value: unknown): value is Promise<void> =>
  typeof (value as Promise<void> | undefined)?.then === 'function'

interface Resolved {
  /** The element `validate` is given: the first of `target`. */
  action: HTMLElement
  cutouts: Cutout[]
}

export class Leko {
  private readonly options: LekoOptions
  /**
   * Every story the application has registered, of which at most one is ever
   * running. Held here so that a call site reports a signal once, to the
   * instance, and never has to know how many stories might care.
   */
  private readonly stories = new Map<string, LekoStory>()
  private currentStory: LekoStory | undefined
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
  /**
   * What the last attempt at the current step was told was wrong with it, set
   * through {@link ErrorUtils.setError}. Held here rather than on the step: it
   * is about one attempt, not about the tour, and the step object belongs to
   * the application.
   */
  private error: string | undefined
  /** Where in `currentStory.steps` the tour is. Exposed by {@link index}. */
  private at = 0
  /**
   * The step whose {@link LekoStep.onEnter} has been called and whose `onLeave`
   * has not. Held rather than worked out from `at`, because a step is abandoned
   * part way through entering often enough — a rejection, or a signal arriving
   * while the handler is still in flight — and the cleanup is owed either way.
   */
  private entered: LekoStep | undefined
  /**
   * True from the call to `onEnter` until it settles. Nothing may be drawn in
   * that window. The target is resolved after `onEnter`, so a resize arriving
   * mid-flight would measure a step the tour has not entered yet.
   */
  private preparing = false
  /**
   * Bumped on every arrival at a step and every stop, so an `onEnter` settling
   * late can tell that it is talking about a step nobody is on any more. The
   * morph asks the same question by reading the state, which will not work
   * here: two entries in a row leave the state saying `transitioning` both
   * times.
   */
  private generation = 0
  private currentState: LekoState = 'idle'
  private onViewportChange: (() => void) | undefined
  private watcher: MutationObserver | undefined

  constructor(options: LekoOptions = {}) {
    this.options = options
  }

  get state(): LekoState {
    return this.currentState
  }

  /**
   * The story being shown, or `undefined` while idle.
   *
   * This is the object the application registered, not a copy. Reading it is
   * the point: `story.steps.length` is the total a progress readout counts
   * against, and {@link index} is the position within it. Adding to or
   * reordering `steps` while it runs moves the ground under that position.
   */
  get story(): LekoStory | undefined {
    return this.currentState === 'idle' ? undefined : this.currentStory
  }

  /** The step being shown, or `undefined` while idle. */
  get step(): LekoStep | undefined {
    return this.currentState === 'idle' ? undefined : this.currentStory?.steps[this.at]
  }

  /**
   * How far into the story the current step sits, or `undefined` while idle.
   *
   * Read this rather than searching `story.steps` for {@link step}. A step is a
   * plain object with no identity of its own, and a story may hold the same one
   * twice, so `indexOf` returns the first of them and a counter built on it
   * walks backwards. Leko is holding the position anyway.
   */
  get index(): number | undefined {
    return this.currentState === 'idle' ? undefined : this.at
  }

  /**
   * Register a story, replacing any story already registered under that id.
   *
   * Replacing rather than adding, so that a component re-registering on every
   * render does not accumulate copies of itself. Doing it to the story that is
   * running swaps what the current step is read from and redraws nothing: a
   * re-render must not restart a tour someone is in the middle of.
   */
  setStory(story: LekoStory): void {
    this.stories.set(story.id, story)
    if (this.currentStory?.id === story.id) this.currentStory = story
  }

  /**
   * Show `storyId`, from its first step or from `at` — a step id or an index.
   *
   * Whatever was running stops, and reports its own ending first. One story at
   * a time is the whole design: two scrims would each block with rectangles
   * built from their own cutouts, so each would cover the other's target.
   *
   * Moving a user from one story into another is an ordinary thing to do, and
   * `at` composes them: run a shared story, branch into one of several, then
   * start the shared one again at the step the branch rejoins. The switch cuts
   * rather than morphs, the same as any other start, because two unrelated
   * stories interpolating into each other would be a strange thing to watch.
   *
   * Nothing is torn down until the arguments are known to be good, so a typo
   * cannot end a tour someone is in the middle of. An `at` that is not a whole
   * number in range is such a typo: `steps[1.5]` is nowhere.
   */
  start(storyId: string, at: string | number = 0): void {
    const story = this.stories.get(storyId)
    if (!story) return
    const index = typeof at === 'string' ? story.steps.findIndex((s) => s.id === at) : at
    if (!Number.isInteger(index) || index < 0 || index >= story.steps.length) return
    this.stop()
    // The ending `stop` just reported is somewhere a host can react to by
    // starting a story of its own, and that story is running by the time this
    // returns. Carrying on would overwrite it, and it would never report an
    // ending of its own. So the most recent `start` wins, which is the one made
    // with the most information.
    if (this.currentState !== 'idle') return
    this.currentStory = story
    this.at = index
    this.currentState = 'running'
    this.enter(false, undefined)
  }

  /**
   * Story first, then instance: the same near-to-far order the settings read
   * in. Both fire, because a readout belonging to one story and a counter that
   * spans all of them are different jobs and neither replaces the other.
   *
   * A move is reported only once it has survived being drawn, which is why
   * {@link arrive} asks whether the tour is still on the arrival it started.
   * `draw` ends a run whose target has gone, `stop` reports that ending, and a
   * move announced after it would put a readout back on a story that is over.
   */
  private report(
    story: LekoStory,
    step: LekoStep | undefined,
    previous: LekoStep | undefined,
  ): void {
    story.onStep?.(step, previous)
    this.options.onStep?.(step, previous, story)
  }

  /**
   * Report that something happened in the application.
   *
   * Advances the step that is waiting for this name, after `validate`, and does
   * nothing whatsoever otherwise — no error, and no warning on every unrelated
   * call. Instrumentation is meant to stay in the source permanently, including
   * in builds where no tour ever runs, so an unmatched call has to be free and
   * silent.
   *
   * `name` is any string, always. The project's vocabulary is offered as
   * completion and never enforced here, which is the same reason this method
   * stays silent about a name nothing awaits.
   */
  reached(name: LekoSignal): void {
    const step = this.step
    if (step?.awaits === name) this.advance(step)
  }

  /**
   * Advance whatever step is showing, without naming it.
   *
   * This is for a control on screen: the one Leko puts on the message of a step
   * that declares no signal, or one the host puts in its own chrome — the
   * sandbox's footer. Instrumentation spread through application code wants
   * {@link reached} instead: a bare "advance" has to know the shape of the tour
   * to be written in the right place.
   *
   * A no-op while idle, so callers never have to guard.
   */
  nextStep(): void {
    const step = this.step
    if (step) this.advance(step)
  }

  /**
   * It is *not* a no-op mid morph: silently dropping a call would be Leko
   * deciding the application did not mean it, which is the guessing this library
   * exists to avoid.
   */
  private advance(step: LekoStep): void {
    const story = this.currentStory
    if (!story) return
    const steps = story.steps

    if (step.validate) {
      const action = resolveTarget(asArray(step.target)[0]!)
      if (!action) return this.lose(step)
      if (!step.validate(action)) {
        step.onValidationError?.(action, this.errorUtils(action))
        return
      }
    }

    if (this.at >= steps.length - 1) {
      this.stop()
      return
    }
    this.at += 1
    this.enter(true, step)
  }

  /**
   * Step back. Never validates: going back is not a claim of success.
   *
   * It reports through {@link LekoStory.onStep} like anything else. The hook
   * says where the story is, and not why it went there.
   */
  prevStep(): void {
    const story = this.currentStory
    if (this.currentState === 'idle' || this.at === 0 || !story) return
    const previous = story.steps[this.at]
    this.at -= 1
    this.enter(true, previous)
  }

  /**
   * Reports the ending through {@link LekoStory.onStep} before returning, with
   * `step` as `undefined`. The host that called this knows already, and
   * whatever draws the progress is written somewhere else and does not.
   *
   * A no-op while idle, so it reports once however many times it is called.
   */
  stop(): void {
    if (this.currentState === 'idle') return
    const story = this.currentStory
    const previous = story?.steps[this.at]
    this.generation += 1
    this.preparing = false
    this.currentState = 'idle'
    this.currentStory = undefined
    this.at = 0
    this.error = undefined
    this.teardown()
    this.message?.destroy()
    this.message = undefined
    // The step's own cleanup, then the story's readout: the same near-to-far
    // order everything else here reads in.
    this.leave(undefined)
    if (story) this.report(story, undefined, previous)
  }

  /** Step, then story, then instance: the nearest one that says anything wins. */
  private setting(step: LekoStep, key: 'padding' | 'radius'): number {
    return step[key] ?? this.currentStory?.[key] ?? this.options[key] ?? DEFAULTS[key]
  }

  private errorUtils(action: HTMLElement): ErrorUtils {
    return {
      shake: () => this.layers[0]?.shake(),
      setMessage: (message) => {
        const step = this.currentStory?.steps[this.at]
        if (!step) return
        step.message = message
        // Nothing has moved, so a visible message only changes its words.
        // Re-placing it would jump the box out from under someone in the middle
        // of reading why they were stopped. A step that had no message until now
        // has nowhere to jump from, so that one is placed properly.
        if (this.message?.visible) this.message.setText(message)
        else this.say(step, action)
      },
      setError: (message) => {
        const step = this.currentStory?.steps[this.at]
        if (!step) return
        this.error = message
        if (this.message?.visible) this.message.setError(message)
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

    const padding = this.setting(step, 'padding')
    const radius = this.setting(step, 'radius')

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
    const content: MessageContent = {
      text: step.message,
      error: this.error,
      next: this.nextLabel(step),
    }
    if (!content.text && !content.error && !content.next) {
      this.message?.hide()
      return
    }
    this.message ??= new Message(() => this.nextStep())
    const onScreen = this.resolve(step, (el) => el.getBoundingClientRect())
    const gap = this.setting(step, 'padding')
    this.message.show(content, action, onScreen?.cutouts ?? [], gap)
  }

  /**
   * The words on this step's next control, or `undefined` where it has none.
   *
   * A step that declares a signal never gets one, and that is the whole rule.
   * The step is waiting for the user to do something the application will
   * report, and a button next to the instruction is a way past it without
   * doing that. So this is derived from `awaits` rather than configured per
   * step: nothing a story can write turns the control back on where the second
   * constraint took it away.
   *
   * A step declaring no signal has no other way to end. The control appears
   * even where the step has no message, because a box with a button in it is
   * the difference between a step the user can leave and one they cannot.
   */
  private nextLabel(step: LekoStep): string | undefined {
    if (step.awaits !== undefined) return undefined
    return this.options.nextLabel ?? NEXT_LABEL
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
    const step = this.currentStory?.steps[this.at]
    // Nothing of this step has been measured while its `onEnter` is in flight,
    // and measuring it here would be reading the target early by another route.
    if (this.currentState === 'idle' || this.preparing || !step) return
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

  /**
   * Every arrival at a step, forwards or back, and the only place a step
   * starts. The order is the whole of it: leave the step before this one, let
   * the application build what this one assumes, and only then look at the page.
   *
   * Resolving the target first would read one that does not exist yet, or one
   * that `onEnter` is about to move. So a handler that hands back a promise
   * moves everything below it into a later turn, and one that hands back
   * nothing costs nothing at all.
   */
  private enter(animate: boolean, previous: LekoStep | undefined): void {
    const story = this.currentStory
    const step = story?.steps[this.at]
    if (!story || !step) return this.stop()

    // Whatever was wrong with an attempt at the step being left is not an
    // attempt at this one, which is why `setError` has no counterpart to call.
    this.error = undefined
    // The step being left is over, and the hole is not where it was. There is
    // no honest place for the message until the new cutout has arrived.
    this.message?.hide()
    const run = ++this.generation
    this.leave(step)
    // Leaving is a call into the application, and an application is free to
    // start or stop a story from inside one. Anything it did bumped the counter
    // past `run`, and carrying on would draw this step over the top of it.
    if (this.generation !== run) return
    this.entered = step
    let entering: unknown
    try {
      entering = step.onEnter?.(step)
    } catch (reason) {
      return this.failed(reason)
    }
    if (!isThenable(entering)) return this.arrive(step, animate, story, previous, run)

    // Between two steps with nothing settled, which is what `transitioning`
    // already means. A morph says the same thing about the same gap.
    this.currentState = 'transitioning'
    this.preparing = true
    void entering.then(
      () => {
        if (this.generation !== run) return
        this.preparing = false
        this.arrive(step, animate, story, previous, run)
      },
      (reason: unknown) => {
        if (this.generation !== run) return
        this.preparing = false
        this.failed(reason)
      },
    )
  }

  /**
   * Draw the step, then say the tour moved, in that order and only if it is
   * still the arrival that started.
   *
   * `draw` hands a lost target to `lose`, and a host that handles it keeps the
   * tour on this step, so that path reports the move like any other. A host
   * with no handler gets a `stop`, which bumps the generation and reports the
   * ending itself.
   */
  private arrive(
    step: LekoStep,
    animate: boolean,
    story: LekoStory,
    previous: LekoStep | undefined,
    run: number,
  ): void {
    // `onEnter` is the other call into the application that can take the tour
    // somewhere else before anything of this step has been drawn.
    if (this.generation !== run) return
    this.draw(step, animate)
    if (this.generation === run) this.report(story, step, previous)
  }

  /**
   * Pairs with {@link LekoStep.onEnter}, once for every call to it. Cleared
   * before the handler runs, so an `onLeave` that calls `stop()` does not come
   * back round to itself.
   */
  private leave(next: LekoStep | undefined): void {
    const step = this.entered
    this.entered = undefined
    step?.onLeave?.(step, next)
  }

  /**
   * An `onEnter` that failed leaves a step assuming a state nobody built, so
   * the tour stops rather than pointing the user at something that is not
   * ready. That is what `lose` decides about a target that is not there.
   *
   * The reason is thrown again on its own, because a library that quietly eats
   * an application's exception is why the bug takes a day to find. Throwing it
   * from here instead would land it on whichever call happened to start the
   * step, which is rarely the code that went wrong.
   */
  private failed(reason: unknown): void {
    this.stop()
    queueMicrotask(() => {
      throw reason
    })
  }

  private draw(step: LekoStep, animate: boolean): void {
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

    // The message went when the last step did, and comes back once the cutout
    // has arrived. The side with room is a fact about where the hole ends up,
    // so there is nowhere honest to put it while one is on its way.
    const duration = this.currentStory?.duration ?? this.options.duration ?? DEFAULTS.duration
    const morphing = inner.morph(resolved.cutouts, duration)
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
    const story = this.currentStory
    // Whatever the host decides to do about it, the message goes now: its anchor
    // has left the page, and an anchored element whose anchor is gone falls back
    // to wherever normal positioning puts it.
    this.message?.hide()
    if (story && this.options.onTargetLost) {
      this.options.onTargetLost(step, story.id)
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

export function createLeko(options: LekoOptions = {}): Leko {
  return new Leko(options)
}
