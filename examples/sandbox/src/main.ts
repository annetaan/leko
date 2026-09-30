import type { LekoStep, LekoStory } from '@annetaan/leko'

import { type Case, html } from './case.js'
import { cases } from './cases/index.js'
import { type Running, runCase } from './host.js'

const app = document.querySelector<HTMLElement>('#app')!

app.append(
  html(`
    <div class="shell">
      <aside class="rail">
        <div class="rail-head">
          <h1>Leko sandbox</h1>
          <button type="button" class="theme" data-theme>
            <span class="theme-knob" aria-hidden="true"></span>
          </button>
        </div>
        <p class="rail-note">
          The situations a tour has to survive. Start a story and then use the
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
        <div class="stage-body case-root" data-root></div>
      </main>
      <footer class="controls">
        <div class="log" data-log></div>
        <div class="control-row">
          <span class="starts" data-starts></span>
          <button type="button" data-action="stop">stop()</button>
          <span class="state" data-state>idle</span>
          <span class="note" data-note>No tour running.</span>
          <label class="speed">motion
            <select data-speed>
              <option value="1">×1</option>
              <option value="4">×4 slower</option>
              <option value="10">×10 slower</option>
            </select>
          </label>
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

// The page follows the OS until this switch picks a side. A pick lands on the
// root as `data-theme`, which is where style.css reads it, and is kept across
// reloads. The switch itself only mirrors what is on screen: `data-shown` is
// where the knob sits, and the name says what a press would do.
const themeToggle = pick<HTMLButtonElement>('[data-theme]')
const prefersDark = matchMedia('(prefers-color-scheme: dark)')

function shownTheme(): 'light' | 'dark' {
  const picked = document.documentElement.dataset['theme']
  if (picked === 'light' || picked === 'dark') return picked
  return prefersDark.matches ? 'dark' : 'light'
}

function labelTheme(): void {
  const shown = shownTheme()
  themeToggle.dataset['shown'] = shown
  themeToggle.setAttribute(
    'aria-label',
    `Switch to the ${shown === 'dark' ? 'light' : 'dark'} theme`,
  )
}

const keptTheme = localStorage.getItem('leko-sandbox-theme')
if (keptTheme === 'light' || keptTheme === 'dark') {
  document.documentElement.dataset['theme'] = keptTheme
}

themeToggle.addEventListener('click', () => {
  const next = shownTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset['theme'] = next
  localStorage.setItem('leko-sandbox-theme', next)
  labelTheme()
})
// With no pick made, the OS still decides — so an OS change moves the label.
prefersDark.addEventListener('change', labelTheme)
labelTheme()

// Slow motion, for watching the drawing itself: a 160ms fade inside a 320ms
// morph is over before an eye can settle on it. The pace stretches the morph
// and the halo fade by the same factor, and a step's own `duration` too — see
// `paced` — so what is watched slowed down is the same choreography rather
// than a different one, `step-motion.ts` included. A glide is only partly in
// it: the pace stretches the floor under a glide, which is the paced `duration`
// whether the instance or the step gives it, and not the distance term —
// DESIGN.md, **A glide grows with the distance, and is much slower than the
// morph**. So any glide shorter than the paced floor runs for the floor, which
// at the higher paces is most of them, and a step with a long `duration` of its
// own gets there sooner. Kept across reloads the way the theme is.
const PACES = [1, 4, 10]
const speedPick = pick<HTMLSelectElement>('[data-speed]')
const keptPace = Number(localStorage.getItem('leko-sandbox-pace'))
let pace = PACES.includes(keptPace) ? keptPace : 1

function applyPace(): void {
  speedPick.value = String(pace)
  // Inline on the root, so it outbids the default wherever that is declared.
  // The durations are fixed when the instance is made and the stories are
  // handed over — the instance's in `runCase`, a step's in `paced` — so
  // picking a pace re-shows the case, and `show` reads `pace` for both.
  if (pace === 1) document.documentElement.style.removeProperty('--leko-halo-fade')
  else document.documentElement.style.setProperty('--leko-halo-fade', `${160 * pace}ms`)
}

speedPick.addEventListener('change', () => {
  pace = Number(speedPick.value) || 1
  localStorage.setItem('leko-sandbox-pace', String(pace))
  applyPace()
  if (showing) show(showing)
})
applyPace()

/** When the showing case was mounted, so every row can say how long after it. */
let opened = performance.now()

/**
 * One line in the footer log.
 *
 * The order is the order a host really sees. Every row here is written from
 * inside the call or the hook that produced it, so nothing is reordered and
 * nothing is inferred.
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

/** The case on screen. */
let showing: Case | undefined
/** The showing case, run. */
let running: Running | undefined

/** The step `onStep` named last, which is what a host keeps if it wants a chain. */
let told: LekoStep | undefined

function report(line: string): void {
  const state = running?.leko.state ?? 'idle'
  stateOut.textContent = state
  stateOut.dataset['state'] = state
  noteOut.textContent = line
}

function show(next: Case): void {
  running?.teardown()
  running = undefined

  logOut.replaceChildren()
  opened = performance.now()

  title.textContent = next.title
  proves.textContent = next.proves
  for (const link of nav.querySelectorAll<HTMLElement>('[data-case]')) {
    link.classList.toggle('is-current', link.dataset['case'] === next.id)
  }

  showing = next
  const seen = new Map<LekoStory, LekoStory>()
  const stories = next.stories.map((story) => paced(story, seen))
  stageRoot.replaceChildren()
  running = runCase(next, stageRoot, {
    // The sandbox is a host with chrome of its own: the footer console is
    // sticky and sits above the scrim, so a message that measured the whole
    // viewport landed in it. Named once here for every case, and a case that
    // mounts chrome of its own — `host-chrome.ts` — adds to the list rather
    // than replacing it.
    chrome: ['.controls'],
    // The footer's pace stretches whatever the case asked for. At ×1 this
    // writes the same number the defaults would have landed on. A step's own
    // is `paced`'s.
    options: { duration: (next.options?.duration ?? 320) * pace },
    stories,
    onCall: (text) => note('call', text),
    // A call that did nothing is exactly the thing a person reading a case
    // wants to see.
    onProblem: (text) => note('problem', text),
    onStep: (step, story) => {
      // The log reads as a chain, and `told` is the whole of what that costs a
      // host. Leko names the step it is on and nothing else, so the step it
      // named last is the step this one leaves from, and a host that wants the
      // pair keeps it. One line, and it cannot be wrong: this hook only ever
      // names a step that went up.
      const from = told ? `“${told.id}” → ` : ''
      note('step', `${story.id}: ${from}${step ? `“${step.id}”` : 'the run ended'}`)
      // The whole of the state readout, from the hook that already names every
      // crossing of it. `step === undefined` is the ending, and there is no
      // other way for a tour to stop being on.
      note('state', step ? 'running' : 'idle')
      told = step
    },
    onStatus: report,
  })

  starts.replaceChildren()
  for (const story of running.stories) {
    starts.append(
      html(`<button type="button" data-start="${story.id}">start('${story.id}')</button>`),
    )
  }
}

/**
 * `story` with every `duration` its steps carry stretched by `pace`, and its
 * `next` answering the same for the story that follows. `seen` is one per
 * `show`, so a story reached twice — `summary` from both branches in
 * `branching.ts`, `checkout` from a `next` and from the case's own list — is
 * one paced object. Sandbox-only: nothing in Leko knows a pace.
 */
function paced(story: LekoStory, seen: Map<LekoStory, LekoStory>): LekoStory {
  const known = seen.get(story)
  if (known) return known
  const steps = story.steps.map((step) =>
    step.duration === undefined ? step : { ...step, duration: step.duration * pace },
  )
  const out: LekoStory = { ...story, steps }
  // Written before `next` is mapped, so a story that leads back to itself ends.
  seen.set(story, out)
  const { next } = story
  if (typeof next === 'function') {
    out.next = () => {
      const into = next()
      return into && paced(into, seen)
    }
  } else if (next) out.next = paced(next, seen)
  return out
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
pick('.controls').addEventListener('click', (event) => {
  const el = event.target as HTMLElement
  const id = el.closest<HTMLElement>('[data-start]')?.dataset['start']
  if (id !== undefined) running?.start(id)
  else if (el.closest<HTMLElement>('[data-action="stop"]')) running?.stop()
})

function route(): void {
  // Only the first segment says which case to show. A case may own whatever
  // comes after the slash as a hash of its own — `follow-a-link.ts`'s hash
  // router does — without that being mistaken for an unknown case.
  const id = location.hash.slice(1).split('/')[0]
  const found = cases.find((item) => item.id === id)
  // A hash change a case made of its own is not a request to switch cases,
  // and re-showing the one already on screen would tear its tour down before
  // anything inside the case finished hearing the change. Left alone here, it
  // still reaches whatever inside the case is watching it.
  if (found && found !== showing) show(found)
  else if (!found) show(cases[0]!)
}

window.addEventListener('hashchange', route)
route()

// Once per document, after the first case is up — the line an application
// writes at startup. Not in `show()`: a case switch is not a page load, and
// a call there would log a pickUp() on every switch and every pace change.
running?.pickUp()
