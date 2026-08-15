import type { Leko, LekoStory } from '@annetaan/leko'

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
   */
  stories: (root: HTMLElement) => LekoStory[]
}

export function html<T extends HTMLElement>(markup: string): T {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  return template.content.firstElementChild as T
}
