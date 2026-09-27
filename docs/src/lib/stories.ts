import type { LekoStory } from '@annetaan/leko'

// One module because a story that crosses a page load is shared by both
// pages it runs across — DESIGN.md, **A page load ends the story, and hands
// it on**.

export const thisPage = {
  id: 'this-page',
  steps: [
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

// Starlight's own breakpoint, spelled as its stylesheet spells it. From here
// up the sidebar pane is shown and the menu button has no box; below it the
// pane is `visibility: hidden` and the menu button is the way to it.
export const SIDEBAR_SHOWN = '(min-width: 50rem)'

export const desktopIntro = {
  id: 'desktop-intro',
  steps: [
    {
      id: 'sidebar',
      target: { elements: '#starlight__sidebar', interactive: true },
      message:
        'This is the site’s own sidebar, not a picture of one. Scroll it. ' +
        'The hole hands over the wheel as well as clicks.',
    },
  ],
  next: thisPage,
} satisfies LekoStory

export const mobileIntro = {
  id: 'mobile-intro',
  steps: [
    {
      id: 'menu',
      target: 'starlight-menu-button button',
      message:
        'This is the site’s own menu button, not a picture of one. The ' +
        'sidebar it opens is what a wider window points at instead.',
    },
  ],
  next: thisPage,
} satisfies LekoStory

// A branch on width like any other — DESIGN.md, **A story is atomic, and
// stories are short**. PageTour.astro answers a crossing mid-intro.
export const introFor = () => (matchMedia(SIDEBAR_SHOWN).matches ? desktopIntro : mobileIntro)

// A `/playground` segment closed by a slash, a query, a hash or the end. Astro
// applies `base` in `astro dev` as well as in `astro build`, so this matches
// `/leko/playground/` and `/playground/` alike; the optional slash is for GitHub Pages'
// own redirect from `/leko/playground` to `/leko/playground/`.
const PLAYGROUND_URL = /\/playground\/?(?:[?#]|$)/

export const fromIndex = {
  id: 'from-index',
  steps: [
    {
      id: 'open-playground',
      // Not the sidebar's own link, which is hidden outside SIDEBAR_SHOWN.
      target: { elements: '[data-site-tour-link]', interactive: true },
      message:
        'Open “Playground”. That is a full page load — this ' +
        'document goes, and the next one picks the tour up where its own ' +
        'story starts.',
      awaits: { url: PLAYGROUND_URL },
    },
  ],
  next: introFor,
} satisfies LekoStory
