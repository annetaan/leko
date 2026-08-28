import { createLeko, type Leko, type LekoStep } from '@annetaan/leko'

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
        <p class="rail-note">
          The log at the bottom is every call and every hook, in the order a
          host sees them. What the states mean is drawn in
          <code>packages/machine/model/phases.md</code>.
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
        <div class="log" data-log></div>
        <div class="control-row">
          <span class="starts" data-starts></span>
          <button type="button" data-action="stop">stop()</button>
          <span class="state" data-state>idle</span>
          <span class="note" data-note>No tour running.</span>
        </div>
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
const logOut = pick('[data-log]')

/** When the showing case was mounted, so every row can say how long after it. */
let opened = performance.now()

/**
 * One line in the footer log.
 *
 * The order is the order a host really sees, and it is not the order things
 * happened in. `onStep` is called inside the operation that moved the tour, and
 * `watch` is a microtask, so a move prints its step before it prints the state
 * it left the machine in. Reordering them here would be the sandbox teaching
 * something the API does not do.
 */
function note(kind: 'call' | 'state' | 'step' | 'problem', text: string): void {
  const row = document.createElement('div')
  row.className = 'log-row'
  row.dataset['kind'] = kind

  const at = document.createElement('span')
  at.className = 'log-at'
  at.textContent = `+${Math.round(performance.now() - opened)}ms`

  const label = document.createElement('span')
  label.className = 'log-kind'
  label.textContent = kind

  const body = document.createElement('span')
  body.className = 'log-text'
  body.textContent = text

  row.append(at, label, body)
  logOut.append(row)
  // A case left running for a while is a long tour, not a leak to grow.
  while (logOut.childElementCount > 200) logOut.firstElementChild?.remove()
  logOut.scrollTop = logOut.scrollHeight
}

let teardown: (() => void) | undefined
let unwatch: (() => void) | undefined
let leko: Leko | undefined
let problem: string | undefined
/** The case on screen, which is where the footer's start buttons find a story. */
let showing: Case | undefined
/** The showing case's own step handler, if it asked for one. */
let caseStep: ReturnType<NonNullable<Case['onStep']>> | undefined

/** The step `onStep` named last, which is what a host keeps if it wants a chain. */
let told: LekoStep | undefined

// Reading the instance from in here is the point of the test: if the hook fired
// before Leko had finished moving, this would print the step it just left.
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
  noteOut.textContent = [where, problem].filter(Boolean).join('  ⟵  ')
}

function show(next: Case): void {
  leko?.stop()
  unwatch?.()
  unwatch = undefined
  problem = undefined
  teardown?.()

  logOut.replaceChildren()
  opened = performance.now()

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

    // Nothing is logged by the library, so this is where a project decides.
    // The sandbox puts it in the footer, because a call that did nothing is
    // exactly the thing a person reading a case wants to see.
    onDiagnostic: (found) => {
      if (found.kind === 'signal-dropped') {
        problem = `reached('${found.name}') arrived while “${found.step.id}” was still being built, and was dropped.`
      } else if (found.kind === 'target-lost') {
        problem = `Target for “${found.story.id} / ${found.step.id}” never turned up. The tour stopped rather than point at nothing.`
      } else if (found.kind === 'call-refused') {
        problem = 'start() arrived while Leko was inside the application, and was not acted on.'
      } else if (found.kind === 'tour-running') {
        problem = `start() was given “${found.story.id}” while “${found.running.id}” was running. Press stop() first: start() never ends a tour.`
      } else {
        problem = `start() was given “${found.story.id}”, which has no steps in it.`
      }
      note('problem', problem)
      report()
    },
    // The one hook that says where the tour got to, for however many stories a
    // case registers, and it is told which story each time. A host whose
    // stories live in several places writes exactly this and routes it, which
    // is what the second line does.
    onStep: (step, story) => {
      // The log reads as a chain, and `told` is the whole of what that costs a
      // host. Leko names the step it is on and nothing else, so the step it
      // named last is the step this one leaves from, and a host that wants the
      // pair keeps it. One line, and it cannot be wrong: this hook only ever
      // names a step that went up.
      const from = told ? `“${told.id}” → ` : ''
      note('step', `${story.id}: ${from}${step ? `“${step.id}”` : 'the run ended'}`)
      told = step
      report()
      caseStep?.(step, story)
    },
  })

  // `state` moves when no step does: a morph landing, a story's onEnter in
  // flight, a target being looked for again. This read the instance on every
  // frame for as long as a story ran before `watch` existed, which is what the
  // hook was written to replace.
  unwatch = leko.watch((state) => {
    note('state', state)
    report()
  })

  stageRoot.replaceChildren()
  teardown = next.mount(stageRoot, leko)
  caseStep = next.onStep?.(stageRoot, leko)

  starts.replaceChildren()
  showing = next
  for (const story of next.stories) {
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

// There is no `next` here, and there is nowhere for one to go. Advancing a step
// without naming a signal is the next control on the message, and that control
// only exists on a step that declares no `awaits`. A button in this footer would
// be one that ignores that.
const actions: Record<string, () => void> = {
  stop: () => {
    note('call', 'stop()')
    leko?.stop()
  },
}

pick('.controls').addEventListener('click', (event) => {
  const el = event.target as HTMLElement
  const id = el.closest<HTMLElement>('[data-start]')?.dataset['start']
  const story = showing?.stories.find((one) => one.id === id)
  if (story) {
    problem = undefined
    // Logged before the call rather than after, so the diagnostic a refused
    // start makes sits under the call that made it. `start` returns nothing,
    // and a call that came to nothing is a diagnostic on the next row.
    note('call', `start('${story.id}')`)
    leko?.start(story)
  } else {
    const action = el.closest<HTMLElement>('[data-action]')
    if (!action) return
    actions[action.dataset['action'] ?? '']?.()
  }
  // The note beside the chip carries the diagnostic, which `watch` knows
  // nothing about. The state half of the readout looks after itself now.
  report()
})

function route(): void {
  const id = location.hash.slice(1)
  show(cases.find((item) => item.id === id) ?? cases[0]!)
}

window.addEventListener('hashchange', route)
route()
