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
  {
    label: 'Stories',
    items: [
      {
        id: 'two-stories',
        label: 'Two stories, one screen',
        line:
          'One Place the order button reports that the order went through, and only the ' +
          'story waiting for that moves; the other story on the same screen stays put.',
      },
      {
        id: 'branching',
        label: 'A tour that branches',
        line:
          'Two buttons choose the way on, each way is a short story of its own, and both ' +
          'hand the tour to a summary once the order is sent.',
      },
      {
        id: 'story-setup',
        label: 'A story that sets its own scene',
        line:
          'A story that loads a draft order into an empty table before its first hole is ' +
          'drawn, and empties the table again when the tour ends.',
      },
      {
        id: 'step-setup',
        label: 'A step that sets its own scene',
        line:
          'A step that opens a closed section and waits for the address to load into it, ' +
          'so the postcode field can be lit, and closes the section again afterwards.',
      },
    ],
  },
  {
    label: 'Pages',
    items: [
      {
        id: 'follow-a-link',
        label: 'A step that waits for a URL',
        line:
          'Two links with no handler written for the tour, one through a small router and ' +
          'one a plain hash link, and each step moves because the URL came to match.',
      },
      {
        id: 'across-a-page-load',
        label: 'A tour that crosses a page load',
        line:
          'A plain link loads a new page, and the tour carries on there from the first step ' +
          'of the story the last page named.',
      },
    ],
  },
  {
    label: 'Targets',
    items: [
      {
        id: 'which-match',
        label: 'Which of several matches a step means',
        line:
          'Three Save buttons match one selector, and three stories each point at them ' +
          'under a different rule, one of them the default.',
      },
      {
        id: 'nested-scroller',
        label: 'A target inside its own scroller',
        line: 'A row deep inside a scrolling list, whose hole stays on it while the list scrolls.',
      },
      {
        id: 'inside-shadow-dom',
        label: 'A target inside a shadow root',
        line:
          'A button no selector can reach, named with a function, and pressed through the ' +
          'hole like any other.',
      },
      {
        id: 'svg-target',
        label: 'A shape inside an SVG',
        line:
          'A hole cut around a shape in a scaled SVG diagram, and the shape itself takes ' +
          'the click that moves the step.',
      },
      {
        id: 'scrolls-into-view',
        label: 'A step that goes and gets its target',
        line:
          'Each step brings its target to the middle of the screen before it is drawn, and ' +
          'leaves the page alone when the target is already showing.',
      },
      {
        id: 'sticky-header',
        label: 'A bar that pins, and a table head that pins inside a panel',
        line:
          'One filter button lit twice, once before its bar pins to the top of the screen and ' +
          'once after, and a table head pinned inside a scrolling panel; the hole stays on each ' +
          'across the pin.',
      },
      {
        id: 'fixed-chrome',
        label: 'Chrome that does not scroll',
        line:
          'A fixed Share button whose hole stays put while the page scrolls, a fixed badge a ' +
          'transform took back into the page whose hole rides with it, and a scroll lock ' +
          'pressed mid-step.',
      },
    ],
  },
  {
    label: 'Looks',
    items: [
      {
        id: 'styled-tour',
        label: 'A tour in the host’s clothes',
        line:
          'One stylesheet of the page’s own restyles the scrim, the message and the halo, ' +
          'with a quieter halo on the hole that is only shown.',
      },
      {
        id: 'message-sides',
        label: 'Which side the message takes',
        line:
          'Targets at each edge of the screen, between two fixed rails, and a step with ' +
          'nothing to point at, so the message takes whichever side has room or docks at ' +
          'the foot.',
      },
      {
        id: 'host-easing',
        label: 'A tour that moves the way the application does',
        line:
          'One curve on the instance, slow at both ends, eases both the hole and the page ' +
          'on every trip down and back.',
      },
    ],
  },
]
