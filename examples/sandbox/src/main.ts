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
          Eight situations a tour has to survive. Start a tour and then use the
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
        <button type="button" data-action="start">start()</button>
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
const stateOut = pick('[data-state]')
const noteOut = pick('[data-note]')

let teardown: (() => void) | undefined
let current: Case | undefined
let tour: Leko | undefined
let lost: string | undefined

function report(): void {
  const state = tour?.state ?? 'idle'
  stateOut.textContent = state
  stateOut.dataset['state'] = state

  if (lost) {
    noteOut.textContent = lost
    return
  }
  const step = tour?.step
  noteOut.textContent = step ? `“${step.id}” — ${step.message ?? 'no message'}` : 'No tour running.'
}

// The state settles when a morph finishes, so keep reading it until it does.
function watch(): void {
  report()
  if (tour?.state === 'transitioning') requestAnimationFrame(watch)
}

function show(next: Case): void {
  tour?.stop()
  tour = undefined
  lost = undefined
  teardown?.()
  current = next

  title.textContent = next.title
  proves.textContent = next.proves
  for (const link of nav.querySelectorAll<HTMLElement>('[data-case]')) {
    link.classList.toggle('is-current', link.dataset['case'] === next.id)
  }

  stageRoot.replaceChildren()
  teardown = next.mount(stageRoot)
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
  start: () => {
    if (!current) return
    tour?.stop()
    lost = undefined
    tour = createLeko({
      steps: current.steps(stageRoot),
      onTargetLost: (step) => {
        lost = `Target for “${step.id}” is gone. The tour stopped rather than point at nothing.`
        tour?.stop()
        report()
      },
    })
    tour.start()
  },
  next: () => tour?.nextStep(),
  prev: () => tour?.prevStep(),
  stop: () => tour?.stop(),
}

pick('.controls').addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if (!action) return
  actions[action.dataset['action'] ?? '']?.()
  watch()
})

function route(): void {
  const id = location.hash.slice(1)
  show(cases.find((item) => item.id === id) ?? cases[0]!)
}

window.addEventListener('hashchange', route)
route()
