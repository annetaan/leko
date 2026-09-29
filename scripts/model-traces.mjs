// Harvest the corpora `packages/machine/src/replay.test.ts` and
// `packages/presenter/src/replay.test.ts` replay.
//
// Each entry below names a state in one of the two models and asks `quint run`
// to find a way to it, by handing it the negation as an invariant: the shortest
// thing that breaks "this never happens" is a trace where it does. That is a
// better corpus than the same number of random walks, because every trace
// arrives somewhere worth arriving.
//
// The seeds are fixed so the files are reproducible and a diff means something.
// They are not portable across Quint versions, which is why regenerating is a
// command somebody runs rather than something CI checks; the version is pinned
// exactly in `package.json`.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * One entry per model: where it is, where its traces go, and what to aim at.
 *
 * `target` is a definition in the model. `deep` swaps the wide search for the
 * one that stays inside a running story; see `stepInside` in `machine.qnt` for
 * why there are two, and note that the plan's model has only the one.
 */
const CORPORA = [
  {
    model: 'packages/machine/model/machine.qnt',
    out: 'packages/machine/model/traces',
    harvest: [
      { name: 'refused', target: 'refused', seed: '0x9' },
      { name: 'start-tearing', target: 'startWhileTearing', seed: '0xe' },
      { name: 'start-running', target: 'startWhileRunning', seed: '0x15' },
      { name: 'signal-tearing', target: 'signalWhileTearing', seed: '0x10' },
      { name: 'stop-tearing', target: 'stoppedWhileTearing', seed: '0x11' },
      { name: 'stale-report', target: 'staleReport', seed: '0xa', deep: true },
      { name: 'refused-said', target: 'refusedWithWords', seed: '0xb', deep: true },
      { name: 'refused-mute', target: 'refusedInSilence', seed: '0xc', deep: true },
      { name: 'press-on-awaits', target: 'pressOnAwaits', seed: '0x16', deep: true },
      { name: 'chained', target: 'chained', seed: '0x13', deep: true },
      { name: 'chain-ends', target: 'chainEnded', seed: '0x14', deep: true },
      { name: 'last-step', target: 'reachedLastStep', seed: '0x7', deep: true },
    ],
  },
  {
    model: 'packages/presenter/model/plan.qnt',
    out: 'packages/presenter/model/traces',
    // The four claims the issue named are the first four. The rest are the
    // entrances the review of the first plan found unenumerated, and the two
    // last lines of defence.
    harvest: [
      { name: 'settled-stale', target: 'settledStale', seed: '0x1' },
      { name: 'expired-stale', target: 'expiredStale', seed: '0x2' },
      { name: 'resized-in-glide', target: 'resizedInGlide', seed: '0x3' },
      { name: 'show-over-glide', target: 'showOverGlide', seed: '0x4' },
      // The one above narrowed to a hand-over that itself glides, so two glides
      // are alive at once. `plan.qnt` says beside `glideOverGlide` why the
      // wider target is not enough: its seed landed on `show-retry`, and the
      // state where the mode's glide and the glides still running can disagree
      // was never reached.
      { name: 'glide-over-glide', target: 'glideOverGlide', seed: '0x10' },
      { name: 'glide-from-retry', target: 'glideFromRetry', seed: '0x5' },
      // The one above with a step standing behind the glide. `plan.qnt` says
      // beside `glideOverStanding` why the two are separate traces.
      { name: 'glide-over-standing', target: 'glideOverStanding', seed: '0xd' },
      { name: 'retell-in-retry', target: 'retellInRetry', seed: '0x6' },
      { name: 'landed-with-reason', target: 'landedWithReason', seed: '0x7' },
      { name: 'hunt-arrives', target: 'mutatedArrive', seed: '0x8' },
      { name: 'expired-lost', target: 'expiredLost', seed: '0x9' },
      { name: 'expired-arrive', target: 'expiredArrive', seed: '0x11' },
      // The same deadline finding its target and giving it up anyway, because
      // a draw began the wait. `plan.qnt` says beside `expiredUnmeasured` why.
      { name: 'expired-unmeasured', target: 'expiredUnmeasured', seed: '0x12' },
      { name: 'unmeasured-retry', target: 'unmeasuredRetry', seed: '0xa' },
      // A hunt hearing about a step it is not looking for.
      { name: 'hunt-elsewhere', target: 'mutatedElsewhere', seed: '0xf' },
      { name: 'morphed-stale', target: 'morphedStale', seed: '0xb' },
      { name: 'resized-in-retry', target: 'resizedInRetry', seed: '0xc' },
      // A resize whose target has gone, which refits the layers standing
      // rather than cutting the holes again.
      { name: 'resized-gone', target: 'resolvedRefit', seed: '0x13' },
    ],
  },
]

const STEPS = 24
const SAMPLES = 200000

for (const corpus of CORPORA) {
  const model = join(root, corpus.model)
  const out = join(root, corpus.out)

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  for (const { name, target, seed, deep } of corpus.harvest) {
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
    //
    // The world goes to the top for the same reason. It is a model variable so
    // that it lands in the trace at all — that is what lets each replay build
    // its fixture from the trace rather than from a second copy written by hand
    // — but it is written once in `init` and never again, so a copy in every
    // state is the same map repeated. Hoisting it keeps the one definition and
    // takes the repetition out: a step added to a model's world is then a
    // one-line diff per trace rather than one per state.
    const world = trace.states[0].m.world
    // Checked rather than trusted. The world is written in `init` and by
    // nothing else, and hoisting it says so; an action that started writing it
    // would otherwise have its later values dropped here in silence, and every
    // replay afterwards would run against the first state's world. Asking it
    // once per trace costs nothing. Asking it as an invariant costs a deep
    // comparison on every state of every one of 200,000 traces, which is 71%
    // more time on the machine's search — `packages/machine/model/README.md`
    // says so beside the world.
    const shape = JSON.stringify(world)
    const changed = trace.states.findIndex((state) => JSON.stringify(state.m.world) !== shape)
    if (changed !== -1) {
      // And nothing is written. A harvest that reported and wrote anyway would
      // leave a corpus that looks regenerated and carries the first state's
      // world, which every replay afterwards would run green against — the
      // silent green the rest of this script exists to prevent. The file is
      // missing instead, so the count below fails as well.
      console.error(
        `${name}: the world changes at state ${changed}. It can no longer be written once.`,
      )
      process.exitCode = 1
      continue
    }
    for (const state of trace.states) delete state.m.world
    writeFileSync(
      join(out, `${name}.itf.json`),
      `${JSON.stringify({ target, seed, world, states: trace.states }, null, 2)}\n`,
    )
    console.log(`${name}: ${trace.states.length} states`)
  }

  const written = readdirSync(out).filter((file) => file.endsWith('.itf.json'))
  if (written.length !== corpus.harvest.length) process.exitCode = 1

  // `JSON.stringify` puts every array member on its own line and oxfmt collapses
  // the short ones, so a freshly harvested corpus fails `pnpm format:check`. That
  // check runs in CI, and the failure it gives says nothing about traces. Run the
  // formatter here instead of leaving it to whoever regenerates next.
  execFileSync(join(root, 'node_modules/.bin/oxfmt'), ['--write', out], { stdio: 'inherit' })
}
