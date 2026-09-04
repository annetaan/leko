// Search the Quint models for a state that breaks one of their invariants, and
// count how often each search reached the states the model was written to reach.
//
// Two models: `packages/machine/model/machine.qnt` is the machine's `plan.ts`,
// and `packages/leko/model/plan.qnt` is the presenter's. Each is searched under
// its own invariants and witnesses, and the run fails if either search breaks an
// invariant or leaves a witness unreached.
//
// The invariants and the witnesses are read out of each model rather than
// listed here: every `val` under the model's `invariants` heading is checked,
// and every `val` under its `witnesses` heading is counted. A list kept here
// would be a second copy of the model's, and a `val` added to one and not the
// other would be neither checked nor alarmed on — the silent green this whole
// script exists to prevent.
//
// The machine gets two searches, because a uniform choice over the whole action
// set makes `stop` about as likely as anything else and a tour torn down every
// sixth call almost never gets to its third step. `machine.qnt` says the rest
// beside `stepInside`. The plan gets one: `teardown` is one action in eight and
// every witness is reached from `init`.
//
// The seeds are fresh every run. A failure here is therefore not reproducible
// from this file — the run prints `--seed=0x…` and that is what reproduces it.
// See the README beside each model; a failing seed is a finding, not flake.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const quint = join(root, 'node_modules/.bin/quint')

const MODELS = [
  {
    name: 'the machine',
    model: 'packages/machine/model/machine.qnt',
    searches: [
      { name: 'from idle', args: [] },
      { name: 'inside a story', args: ['--init=initRunning', '--step=stepInside'] },
    ],
  },
  {
    name: "the presenter's plan",
    model: 'packages/leko/model/plan.qnt',
    searches: [{ name: 'from idle', args: [] }],
  },
]

/** A section heading in a model: a comment line of dashes ending in the section's name. */
const isHeading = (line) => /^\s*\/\/ -{3,} \w+\s*$/.test(line)

/**
 * The `val`s under one of a model's section headings, up to the next heading
 * or the end. A model with no `val` under a heading is a model this cannot
 * check, and says so.
 */
function valsUnder(source, heading, model) {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => isHeading(line) && line.trim().endsWith(` ${heading}`))
  if (start === -1) throw new Error(`${model} has no "${heading}" heading to read the vals under.`)
  const names = []
  for (const line of lines.slice(start + 1)) {
    if (isHeading(line)) break
    const val = /^\s*val (\w+): bool\b/.exec(line)
    if (val) names.push(val[1])
  }
  if (names.length === 0) throw new Error(`${model} has no vals under its "${heading}" heading.`)
  return names
}

let failed = false

for (const { name, model, searches } of MODELS) {
  const source = readFileSync(join(root, model), 'utf8')
  const invariants = valsUnder(source, 'invariants', model)
  /**
   * Every state the model was written to reach. A zero here is the alarm: the
   * actions have stopped describing a machine that can get there, and every run
   * since then has been green about nothing.
   */
  const witnesses = valsUnder(source, 'witnesses', model)

  /** Counted across a model's searches: what one reaches rarely, another reaches often. */
  const reached = new Map(witnesses.map((witness) => [witness, 0]))
  let broken = false

  for (const search of searches) {
    console.log(`\n# ${name}, ${search.name}`)
    let output
    try {
      output = execFileSync(
        quint,
        [
          'run',
          join(root, model),
          '--invariants',
          ...invariants,
          '--witnesses',
          ...witnesses,
          '--max-steps=24',
          '--max-samples=100000',
          '--verbosity=1',
          ...search.args,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
      )
    } catch (failure) {
      // A violation arrives here with the counterexample on stdout. So does a
      // binary that could not be run, with nothing on stdout at all, and the
      // message is the only thing that says which.
      console.log(failure.stdout || failure.message)
      broken = true
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

  // A search that failed counted nothing, and every witness of it would read as
  // unreached. That is a different diagnosis from the one printed above, and a
  // wrong one, so the counts are read only where every search ran to the end.
  if (broken) continue

  // Counted together rather than per search, because a model's searches are
  // shaped to reach different things: the machine's wide one hardly ever gets
  // to a third step, and its deep one never sees a story displaced. A state
  // none of them reached is one the model can no longer describe.
  for (const [witness, count] of reached) {
    if (count > 0) continue
    console.error(
      `\n${witness} was never reached in ${name}, so nothing this run says is about it.`,
    )
    failed = true
  }
}

if (failed) process.exitCode = 1
