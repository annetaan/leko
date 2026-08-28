// Harvest the corpus `packages/machine/src/replay.test.ts` replays.
//
// Each entry below names a state in `machine.qnt` and asks `quint run` to find a
// way to it, by handing it the negation as an invariant: the shortest thing that
// breaks "this never happens" is a trace where it does. That is a better corpus
// than the same number of random walks, because every trace arrives somewhere
// worth arriving.
//
// The seeds are fixed so the files are reproducible and a diff means something.
// They are not portable across Quint versions, which is why regenerating is a
// command somebody runs rather than something CI checks; the version is pinned
// exactly in `package.json`.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const model = join(root, 'packages/machine/model/machine.qnt')
const out = join(root, 'packages/machine/model/traces')

/**
 * `target` is a definition in the model. `deep` swaps the wide search for the
 * one that stays inside a running story; see `stepInside` in the model for why
 * there are two.
 */
const HARVEST = [
  { name: 'refused', target: 'refused', seed: '0x9' },
  { name: 'start-tearing', target: 'startWhileTearing', seed: '0xe' },
  { name: 'start-running', target: 'startWhileRunning', seed: '0x15' },
  { name: 'signal-tearing', target: 'signalWhileTearing', seed: '0x10' },
  { name: 'stop-tearing', target: 'stoppedWhileTearing', seed: '0x11' },
  { name: 'stale-report', target: 'staleReport', seed: '0xa', deep: true },
  { name: 'refused-said', target: 'refusedWithWords', seed: '0xb', deep: true },
  { name: 'refused-mute', target: 'refusedInSilence', seed: '0xc', deep: true },
  { name: 'chained', target: 'chained', seed: '0x13', deep: true },
  { name: 'chain-ends', target: 'chainEnded', seed: '0x14', deep: true },
  { name: 'last-step', target: 'reachedLastStep', seed: '0x7', deep: true },
]

const STEPS = 24
const SAMPLES = 200000

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const { name, target, seed, deep } of HARVEST) {
  const scratch = join(out, `.${name}.raw.json`)
  const args = [
    'run',
    model,
    `--invariant=not(${target})`,
    `--max-steps=${STEPS}`,
    `--max-samples=${SAMPLES}`,
    `--seed=${seed}`,
    '--mbt',
    `--out-itf=${scratch}`,
    '--verbosity=0',
  ]
  if (deep) args.push('--init=initRunning', '--step=stepInside')

  // A violation is the point, so a non-zero exit is success and silence is the
  // failure: it means nothing reached the state this trace exists to show.
  try {
    execFileSync(join(root, 'node_modules/.bin/quint'), args, { stdio: 'pipe' })
    console.error(`${name}: no trace reaches ${target}. The model no longer says what it did.`)
    process.exitCode = 1
    continue
  } catch {
    // expected
  }

  const trace = JSON.parse(readFileSync(scratch, 'utf8'))
  rmSync(scratch)
  // The header carries a timestamp, so keeping it would make every regeneration
  // a diff. What the replay reads is `states`.
  writeFileSync(
    join(out, `${name}.itf.json`),
    `${JSON.stringify({ target, seed, states: trace.states }, null, 2)}\n`,
  )
  console.log(`${name}: ${trace.states.length} states`)
}

const written = readdirSync(out).filter((f) => f.endsWith('.itf.json'))
if (written.length !== HARVEST.length) process.exitCode = 1

// `JSON.stringify` puts every array member on its own line and oxfmt collapses
// the short ones, so a freshly harvested corpus fails `pnpm format:check`. That
// check runs in CI, and the failure it gives says nothing about traces. Run the
// formatter here instead of leaving it to whoever regenerates next.
execFileSync(join(root, 'node_modules/.bin/oxfmt'), ['--write', out], { stdio: 'inherit' })
