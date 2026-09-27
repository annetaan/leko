import { createScroll, type LekoScroll, type LekoScrollOptions } from '@annetaan/leko/scroll'

/** What the readout says beside each index `onChange` can name. */
const captions = [
  'the hero',
  'the middle card',
  'the left card',
  'the right card',
  'the plans',
  '#coming-soon',
  'the testimonials',
  'the FAQ',
  'the closing section',
]

let notices = 0

const options: LekoScrollOptions = {
  targets: [
    {
      target: '#hero',
      message: { title: 'Lit on arrival', body: 'Nothing to scroll first: the page opens here.' },
    },
    {
      target: '#card-speed',
      message: {
        title: 'Array order',
        body: 'Listed first, so lit first, though all three are level.',
      },
      side: 'top',
    },
    {
      target: '#card-light',
      message: { body: 'A padding of 16 and a radius of 24, its own.' },
      side: 'left',
      padding: 16,
      radius: 24,
    },
    { target: '#card-free', message: { body: 'Lit until the plans come up.' }, side: 'right' },
    {
      target: '.plans',
      message: { title: 'The copy that shows', body: 'Resize across 720px and it moves.' },
    },
    { target: '#coming-soon' },
    { target: '#testimonials', off: true },
    {
      target: '#faq',
      message: { title: 'measure()', body: 'Open a question: the hole follows the new size.' },
    },
    {
      target: '#closing',
      message: { title: 'Pulled back', body: 'Lit at the foot of the page.' },
      side: 'top',
    },
  ],
  intro: { duration: 1200 },
  // The count moves on every call, so a notice that repeats the last index
  // still shows.
  onChange: (index) => {
    notices += 1
    byId('readout-index').textContent = String(index)
    byId('readout-caption').textContent = index === undefined ? 'nothing lit' : captions[index]!
    byId('readout-count').textContent = `${notices} ${notices === 1 ? 'notice' : 'notices'}`
  },
}

let scroll: LekoScroll | undefined = createScroll(options)

function byId(id: string): HTMLElement {
  return document.getElementById(id)!
}

// The page's own buttons, pressed under the scrim.
let presses = 0
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-press]')) {
  button.addEventListener('click', () => {
    presses += 1
    byId('pressed').textContent = `Pressed “${button.textContent}”. ${presses} so far.`
  })
}

// The page moved its own layout, so it says so.
for (const button of document.querySelectorAll<HTMLButtonElement>('.question button')) {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true'
    button.setAttribute('aria-expanded', String(open))
    byId(button.getAttribute('aria-controls')!).hidden = !open
    scroll?.measure()
  })
}

// Off is destroy(), which fires nothing, so the readout is told here. On is a
// fresh createScroll(), which lights whatever the line is at, and being a
// creation runs the intro again when the line is in range —
// [Entering converges, leaving fades](../../../packages/scroll/DESIGN.md#entering-converges-leaving-fades).
const spotlight = byId('spotlight-toggle')
spotlight.addEventListener('click', () => {
  if (scroll === undefined) {
    scroll = createScroll(options)
  } else {
    scroll.destroy()
    scroll = undefined
    byId('readout-index').textContent = '…'
    byId('readout-caption').textContent = 'spotlight off'
  }
  spotlight.setAttribute('aria-pressed', String(scroll !== undefined))
  spotlight.textContent = scroll === undefined ? 'Spotlight: off' : 'Spotlight: on'
})

const hairline = byId('hairline')
const toggle = byId('line-toggle')
toggle.addEventListener('click', () => {
  hairline.hidden = !hairline.hidden
  toggle.textContent = hairline.hidden ? 'Show the line' : 'Hide the line'
})
