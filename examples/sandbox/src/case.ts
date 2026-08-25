import type { Leko, LekoStep, LekoStory } from '@annetaan/leko'

export interface Case {
  id: string
  title: string

  /** What this case is here to demonstrate, in one sentence. */
  proves: string

  /**
   * Render the case into `root`. The returned function tears it down again.
   *
   * `leko` is the instance every story of this case is registered on, handed
   * over so the mounted page can report what happened in it —
   * `leko.reached('order-saved')` — the way an application would report to the
   * instance it exported. It has no story running yet.
   */
  mount: (root: HTMLElement, leko: Leko) => () => void

  /**
   * The stories this case can run. Typed against the real published types on
   * purpose: the sandbox is the first consumer of the API, so a shape that is
   * awkward here is a shape that will be awkward for everyone.
   *
   * `root` and nothing else. A story is steps and the setup they share, and it
   * is never the place a case reaches back for the tour: what takes the tour
   * somewhere — a branch ending by starting the story its paths meet at — is
   * {@link onStep}, which is handed the instance.
   */
  stories: (root: HTMLElement) => LekoStory[]

  /**
   * What this case does when the tour moves, for the few that do anything.
   *
   * There is one `onStep` and it belongs to the instance, so a host whose
   * stories live in several places writes one handler and routes it. The
   * sandbox is that host: it shows one case at a time, so it asks the case
   * showing for a handler here and calls it from the hook on the instance.
   *
   * Built from `root` and `leko` the way `stories` is, because a handler that
   * takes the tour somewhere — a branch ending by starting the story its paths
   * meet at — needs both. Called after `mount`, so the page it reads is there.
   */
  onStep?: (
    root: HTMLElement,
    leko: Leko,
  ) => (step: LekoStep | undefined, previous: LekoStep | undefined, story: LekoStory) => void
}

export function html<T extends HTMLElement>(markup: string): T {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  return template.content.firstElementChild as T
}
