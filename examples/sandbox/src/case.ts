import type { LekoStep } from '@annetaan/leko'

export interface Case {
  id: string
  title: string

  /** What this case is here to demonstrate, in one sentence. */
  proves: string

  /** Render the case into `root`. The returned function tears it down again. */
  mount: (root: HTMLElement) => () => void

  /**
   * The tour this case would run. Typed against the real published types on
   * purpose: the sandbox is the first consumer of the API, so a shape that is
   * awkward here is a shape that will be awkward for everyone.
   */
  steps: (root: HTMLElement) => LekoStep[]
}

export function html<T extends HTMLElement>(markup: string): T {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  return template.content.firstElementChild as T
}
