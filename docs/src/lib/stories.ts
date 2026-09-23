import type { LekoStory } from '@annetaan/leko'

// One module because a story that crosses a page load is shared by both
// pages it runs across — DESIGN.md, **A page load ends the story, and hands
// it on**.

export const thisPage = {
  id: 'this-page',
  steps: [
    {
      id: 'sidebar',
      target: { elements: '#starlight__sidebar', interactive: true },
      message:
        'This is the site’s own sidebar, not a picture of one. Scroll it. ' +
        'The hole hands over the wheel as well as clicks.',
    },
    {
      id: 'source',
      target: '[data-tour-source]',
      message: 'The story running right now is the one written here.',
    },
    {
      id: 'name',
      target: { elements: '[data-tour-input]', interactive: true },
      message:
        'Type your name. Nothing here is listening for a keystroke to ' +
        'move the tour on. The page decides the field is filled in and ' +
        'says so, and this step is the one waiting to hear it.',
      awaits: 'name-entered',
    },
    {
      id: 'done',
      target: '[data-tour-start]',
      message: 'That is the whole idea. Start it again if you like.',
    },
  ],
} satisfies LekoStory

// A `/demo` segment closed by a slash, a query, a hash or the end. Astro
// applies `base` in `astro dev` as well as in `astro build`, so this matches
// `/leko/demo/` and `/demo/` alike; the optional slash is for GitHub Pages'
// own redirect from `/leko/demo` to `/leko/demo/`.
const DEMO_URL = /\/demo\/?(?:[?#]|$)/

export const fromIndex = {
  id: 'from-index',
  steps: [
    {
      id: 'open-demo',
      // Below Starlight's 50em breakpoint the sidebar pane is
      // `visibility: hidden`, not removed, so a step that pointed at its
      // own link kept a box on screen with nothing to click, and this
      // step's `awaits: { url }` leaves it no next control to escape a hole
      // drawn over it. The step targets a link SiteTour.astro renders
      // itself instead, visible at every width; `href()` puts the base on.
      target: { elements: '[data-site-tour-link]', interactive: true },
      message:
        'Open “A tour of this page”. That is a full page load — this ' +
        'document goes, and the next one picks the tour up where its own ' +
        'story starts.',
      awaits: { url: DEMO_URL },
    },
  ],
  next: thisPage,
} satisfies LekoStory
