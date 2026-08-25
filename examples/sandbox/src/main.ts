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
          Fifteen situations a tour has to survive. Start a story and then use the
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
let leko: Leko | undefined
let lost: string | undefined
let problem: string | undefined

// Called by every story's onStep, so the readout is told rather than looking.
// Reading the instance from in here is the point of the test: if the hook fired
// before Leko had finished moving, this would print the step it just left.
let following = false
function report(): void {
  const state = leko?.state ?? 'idle'
  stateOut.textContent = state
  stateOut.dataset['state'] = state

  const story = leko?.story
  const step = leko?.step
  // The position comes from the instance. Searching `steps` for `step` would
  // count the wrong one in a story that shows the same step object twice.
  const index = leko?.index
  const where =
    story && step && index !== undefined
      ? `${story.id} ${index + 1}/${story.steps.length} · “${step.id}” — ${step.message ?? 'no message'}`
      : 'No story running.'
  // A diagnostic outlives the step it was reported during, because that step is
  // usually still on screen waiting for the signal that got dropped.
  noteOut.textContent = lost ?? [where, problem].filter(Boolean).join('  ⟵  ')

  // `state` has no hook of its own, on purpose: it changes when a morph starts
  // and again when it lands, while the step does not move either time. So the
  // chip follows it for the length of one morph and stops.
  if (state !== 'transitioning' || following) return
  following = true
  const tick = (): void => {
    following = (leko?.state ?? 'idle') === 'transitioning'
    report()
    if (following) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function show(next: Case): void {
  leko?.stop()
  lost = undefined
  problem = undefined
  teardown?.()

  title.textContent = next.title
  proves.textContent = next.proves
  for (const link of nav.querySelectorAll<HTMLElement>('[data-case]')) {
    link.classList.toggle('is-current', link.dataset['case'] === next.id)
  }

  // One instance per case, made before the page is mounted so the page can be
  // given it — an application exports its instance and reports to that, rather
  // than being handed a tour once one starts.
  leko = createLeko({
    // Leko puts no words of its own on the curtain, because it cannot know what
    // an onEnter is doing. This one can: every slow handler in these cases is
    // standing in for a request.
    curtainLabel: 'Setting the step up…',
    onTargetLost: (step, story) => {
      lost = `Target for “${story} / ${step.id}” is gone. The tour stopped rather than point at nothing.`
      leko?.stop()
      report()
    },
    // Nothing is logged by the library, so this is where a project decides.
    // The sandbox puts it in the footer, because a call that did nothing is
    // exactly the thing a person reading a case wants to see.
    onDiagnostic: (found) => {
      problem =
        found.kind === 'signal-dropped'
          ? `reached('${found.name}') arrived while “${found.step.id}” was still being built, and was dropped.`
          : `${found.kind}: ${JSON.stringify(found)}`
      report()
    },
    // One footer for however many stories a case registers, so it goes on the
    // instance. A readout belonging to a single story goes on that story.
    onStep: report,
  })

  stageRoot.replaceChildren()
  teardown = next.mount(stageRoot, leko)

  starts.replaceChildren()
  for (const story of next.stories(stageRoot, leko)) {
    leko.setStory(story)
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
  next: () => leko?.nextStep(),
  stop: () => leko?.stop(),
}

pick('.controls').addEventListener('click', (event) => {
  const el = event.target as HTMLElement
  const story = el.closest<HTMLElement>('[data-start]')?.dataset['start']
  if (story) {
    lost = undefined
    problem = undefined
    leko?.start(story)
  } else {
    const action = el.closest<HTMLElement>('[data-action]')
    if (!action) return
    actions[action.dataset['action'] ?? '']?.()
  }
  // A step whose onEnter waits for something reports nothing until it lands, so
  // the chip would sit on the last state it was told about for as long as the
  // handler runs. Asking once here is what starts it following.
  report()
})

function route(): void {
  const id = location.hash.slice(1)
  show(cases.find((item) => item.id === id) ?? cases[0]!)
}

window.addEventListener('hashchange', route)
route()
