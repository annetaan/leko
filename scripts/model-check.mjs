// Search `packages/machine/model/machine.qnt` for a state that breaks one of its
// invariants, and count how often the search reached the states it was written
// to reach.
//
// Two searches, because a uniform choice over the whole action set makes `stop`
// about as likely as anything else and a tour torn down every sixth call almost
// never gets to its third step. `machine.qnt` says the rest beside
// `stepInside`.
//
// The seeds are fresh every run. A failure here is therefore not reproducible
// from this file — the run prints `--seed=0x…` and that is what reproduces it.
// See `packages/machine/model/README.md`; a failing seed is a finding, not flake.

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const model = join(root, 'packages/machine/model/machine.qnt')
const quint = join(root, 'node_modules/.bin/quint')

const INVARIANTS = ['runningIsDrawn', 'idleIsClean']

/**
 * Every state the model was written to reach. A zero here is the alarm: the
 * actions have stopped describing a machine that can get there, and every run
 * since then has been green about nothing.
 */
const WITNESSES = [
  'refused',
  'emptyStory',
  'staleReport',
  'tearing',
  'startWhileTearing',
  'startWhileRunning',
  'signalWhileTearing',
  'stoppedWhileTearing',
  'refusedWithWords',
  'refusedInSilence',
  'chained',
  'chainEnded',
  'reachedLastStep',
]

const SEARCHES = [
  { name: 'from idle', args: [] },
  { name: 'inside a story', args: ['--init=initRunning', '--step=stepInside'] },
]

let failed = false
/** Counted across both searches: what one reaches rarely, the other reaches often. */
const reached = new Map(WITNESSES.map((name) => [name, 0]))

for (const { name, args } of SEARCHES) {
  console.log(`\n# ${name}`)
  let output
  try {
    output = execFileSync(
      quint,
      [
        'run',
        model,
        '--invariants',
        ...INVARIANTS,
        '--witnesses',
        ...WITNESSES,
        '--max-steps=24',
        '--max-samples=100000',
        '--verbosity=1',
        ...args,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    )
  } catch (failure) {
    console.log(failure.stdout ?? '')
    failed = true
    continue
  }
  console.log(output.trim())

  // `--witnesses` reports rather than fails, so the reading is done here.
  for (const line of output.split('\n')) {
    const hit = /^(\w+) was witnessed in (\d+) trace/.exec(line.trim())
    if (hit) reached.set(hit[1], (reached.get(hit[1]) ?? 0) + Number(hit[2]))
  }
}

// Counted together rather than per search, because the two are shaped to reach
// different things: the wide one hardly ever gets to a third step, and the deep
// one never sees a story displaced. A state neither of them reached is one the
// model can no longer describe, and every run since it stopped has been green
// about nothing.
for (const [name, count] of reached) {
  if (count > 0) continue
  console.error(`\n${name} was never reached, so nothing this run says is about it.`)
  failed = true
}

if (failed) process.exitCode = 1
