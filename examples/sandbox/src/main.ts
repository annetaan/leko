import { createLeko, type Leko } from '@annetaan/leko'

import { type Case, html } from './case.js'
import { cases } from './cases/index.js'

const app = document.querySelector<HTMLElement>('#app')!

app.append(
  html(`
    <div class="shell">
      <aside class="rail">
        <h1>Leko sandbox</h1>
        <p class="rail-note">
          Nine situations a tour has to survive. Start a story and then use the
          page — the cutout is a hole, so everything inside it still works.
          The step's message sits beside its cutout and follows it as you
          scroll; the bar below repeats it, along with the state.
        </p>
        <nav class="cases" data-nav></nav>
      </aside>
      <main class="stage">
        <header class="stage-head">
          <h2 data-title></h2>
          <p class="proves" data-proves></p>
        </header>
        <div class="stage-body" data-root></div>
      </main>
      <footer class="controls">
        <span class="starts" data-starts></span>
        <button type="button" data-action="next">nextStep()</button>
        <button type="button" data-action="prev">prevStep()</button>
        <button type="button" data-action="stop">stop()</button>
        <span class="state" data-state>idle</span>
        <span class="note" data-note>No tour running.</span>
      </footer>
    </div>
  `),
)

const pick = <T extends HTMLElement>(selector: string): T => app.querySelector<T>(selector)!

const nav = pick('[data-nav]')
const title = pick('[data-title]')
const proves = pick('[data-proves]')
const stageRoot = pick('[data-root]')
const starts = pick('[data-starts]')
const stateOut = pick('[data-state]')
const noteOut = pick('[data-note]')

let teardown: (() => void) | undefined
let tour: Leko | undefined
let lost: string | undefined

let shown = ''

function report(): void {
  const state = tour?.state ?? 'idle'
  stateOut.textContent = state
  stateOut.dataset['state'] = state

  const step = tour?.step
  const text = lost
    ? lost
    : step
      ? `${tour?.story} / “${step.id}” — ${step.message ?? 'no message'}`
      : 'No story running.'
  // Only when the words changed, because this runs every frame while a story is
  // on screen and the footer is a readout, not an animation.
  if (text !== shown) {
    noteOut.textContent = text
    shown = text
  }
}

// The footer is not the only thing that moves a story — the page does it too,
// by reporting a signal — and Leko emits no events to listen for, so the
// readout keeps looking until the story ends. One loop at a time.
let watching = false
function watch(): void {
  if (watching) return
  const tick = (): void => {
    report()
    watching = tour !== undefined && tour.state !== 'idle'
    if (watching) requestAnimationFrame(tick)
  }
  tick()
}

function show(next: Case): void {
  tour?.stop()
  lost = undefined
  teardown?.()

  title.textContent = next.title
  proves.textContent = next.proves
  for (const link of nav.querySelectorAll<HTMLElement>('[data-case]')) {
    link.classList.toggle('is-current', link.dataset['case'] === next.id)
  }

  // One instance per case, made before the page is mounted so the page can be
  // given it — an application exports its instance and reports to that, rather
  // than being handed a tour once one starts.
  tour = createLeko({
    onTargetLost: (step, story) => {
      lost = `Target for “${story} / ${step.id}” is gone. The tour stopped rather than point at nothing.`
      tour?.stop()
      report()
    },
  })

  stageRoot.replaceChildren()
  teardown = next.mount(stageRoot, tour)

  starts.replaceChildren()
  for (const story of next.stories(stageRoot)) {
    tour.setStory(story)
    starts.append(
      html(`<button type="button" data-start="${story.id}">start('${story.id}')</button>`),
    )
  }
  report()
}

for (const item of cases) {
  nav.append(
    html<HTMLAnchorElement>(
      `<a class="case" href="#${item.id}" data-case="${item.id}">
         <span class="case-title">${item.title}</span>
       </a>`,
    ),
  )
}

const actions: Record<string, () => void> = {
  next: () => tour?.nextStep(),
  prev: () => tour?.prevStep(),
  stop: () => tour?.stop(),
}

pick('.controls').addEventListener('click', (event) => {
  const el = event.target as HTMLElement
  const story = el.closest<HTMLElement>('[data-start]')?.dataset['start']
  if (story) {
    lost = undefined
    tour?.start(story)
  } else {
    const action = el.closest<HTMLElement>('[data-action]')
    if (!action) return
    actions[action.dataset['action'] ?? '']?.()
  }
  watch()
})

function route(): void {
  const id = location.hash.slice(1)
  show(cases.find((item) => item.id === id) ?? cases[0]!)
}

window.addEventListener('hashchange', route)
route()
