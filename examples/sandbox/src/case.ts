import type { Leko, LekoOptions, LekoStep, LekoStory } from '@annetaan/leko'

export interface Case {
  id: string
  title: string

  /** What this case is here to demonstrate, in one sentence. */
  proves: string

  /**
   * What this case hands `createLeko`, for the few that prove an option.
   * `runCase`'s hooks are added on top and cannot be taken over from here.
   */
  options?: LekoOptions

  /**
   * Render the case into `root`. The returned function tears it down again.
   *
   * `leko` is the instance this case's stories run on, handed over so the
   * mounted page can report what happened in it —
   * `leko.reached('order-saved')` — the way an application would report to the
   * instance it exported. It has no story running yet.
   */
  mount: (root: HTMLElement, leko: Leko) => () => void

  /**
   * The stories this case can run, in the order the footer offers them. Typed
   * against the real published types on purpose: the sandbox is the first
   * consumer of the API, so a shape that is awkward here is a shape that will
   * be awkward for everyone.
   *
   * A value rather than a function of the mounted root, because a target is a
   * question Leko asks when it needs the box rather than an element resolved
   * up front. So a story is written beside the case that owns it and both
   * {@link mount} and {@link onStep} can name the one they start.
   */
  stories: LekoStory[]

  /**
   * What this case does when the tour moves, for the few that do anything.
   *
   * There is one `onStep` and it belongs to the instance, so a host whose
   * stories live in several places writes one handler and routes it. The
   * sandbox is that host: it shows one case at a time, so it asks the case
   * showing for a handler here and calls it from the hook on the instance.
   *
   * Built from `root` and `leko`, because a handler that takes the tour
   * somewhere — a branch ending by starting the story its paths meet at —
   * needs both. Called after `mount`, so the page it reads is there.
   */
  onStep?: (root: HTMLElement, leko: Leko) => (step: LekoStep | undefined, story: LekoStory) => void
}

/**
 * The element a selector names, which a case reads when it needs one to work
 * with rather than to point at.
 *
 * Scoped to the document rather than to a case's root, because one case is
 * mounted at a time and a story is written before there is a root to scope to.
 * A `target` never comes through here: Leko is handed the selector itself and
 * asks it again every time it needs the box.
 */
export const at = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!

export function html<T extends HTMLElement>(markup: string): T {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  return template.content.firstElementChild as T
}
