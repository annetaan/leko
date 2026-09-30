// The whole selection of sandbox cases the site runs, and the only place it is
// written: the sidebar in astro.config.mjs and the route in pages/examples/ both
// read it — CONTRIBUTING.md, **Examples on the site**.

export interface Example {
  /** The case's `id`, its file name under examples/sandbox/src/cases/, and the page's slug. */
  id: string
  /** The sidebar entry and the page title. */
  label: string
  /** What the example shows, in one sentence: the page's first paragraph and its description. */
  line: string
}

export interface Group {
  label: string
  items: Example[]
}

export const groups: Group[] = [
  {
    label: 'Basics',
    items: [
      {
        id: 'stepping',
        label: 'Stepping around a page',
        line:
          'A tour with nothing to wait for: six targets of different shapes, and the last ' +
          'one sits in the corner the End tour control wants, so the control moves.',
      },
      {
        id: 'next-control',
        label: 'Typing, and the control that follows it',
        line:
          'A step the page cannot report gets a Next control with a guard on it, and the ' +
          'step after it waits for the save and has neither.',
      },
      {
        id: 'look-then-use',
        label: 'A hole to read, then a hole to use',
        line:
          'A hole that only shows the card under it, then a hole that hands its field over ' +
          'to be typed into.',
      },
      {
        id: 'linked-regions',
        label: 'A summary and the row behind it',
        line: 'Two parts of the page lit at once, as two holes, because one explains the other.',
      },
    ],
  },
  {
    label: 'Waiting',
    items: [
      {
        id: 'async-completion',
        label: 'Waiting on an async result',
        line:
          'A Save button whose step ends when the request comes back, 1200 ms after the ' +
          'press, and not at the click.',
      },
      {
        id: 'form-validation',
        label: 'Form validation',
        line:
          'Two fields whose Next control is guarded by the page’s own check, so a bad email ' +
          'or a short password is refused with an error under the instruction.',
      },
      {
        id: 'target-not-there-yet',
        label: 'A target that has not turned up yet',
        line:
          'One story whose row turns up in time and is drawn as though nothing happened, ' +
          'and one whose target never turns up, so the tour stops and says so.',
      },
    ],
  },
]
