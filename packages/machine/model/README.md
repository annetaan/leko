# A model of the machine

`machine.qnt` is `packages/machine/src/machine.ts` written down as a state
machine, in [Quint](https://quint.sh/). A search walks it looking for a state
that breaks one of its invariants, and the traces it finds are replayed against
the real class. [`phases.md`](phases.md) is the same machine as a picture.

I wrote it because `machine.test.ts` had grown to 1901 lines and every one of
them was an example I had thought of. It is 1828 now, because the presenter the
tests drive moved to `src/fake.ts` so the replay could share it and because
three of the searches came back with something. Four bugs
turned up in one week that I had not thought of. All four were reachable in
under five calls. Reading does not scale past about 700 lines, so I wanted
something that searches.

## Running it

```bash
pnpm model          # search for a state that breaks an invariant
pnpm model:traces   # regenerate the corpus under traces/
pnpm test           # among other things, replay the corpus
```

`pnpm model` takes about 7 seconds here and runs in CI. It needs no JVM. Quint's
Rust backend is the default and comes with the npm package, and only
`quint verify` wants Apalache and a Java runtime. I have not tried `verify`.

## What is checked, and where

Only two of the seven claims I started with are things a state predicate can
see. Those two live here:

| | |
| --- | --- |
| `runningIsDrawn` | `state == "running"` means there is a step and the presenter has it |
| `idleIsClean` | `state == "idle"` means everything is empty and the presenter is down |

The other five are claims about what a *transition* did. "Nothing moved while
the gate was closed." "Exactly one `onLeave` per `onEnter`." "Every `previous`
is where the last report arrived." A predicate over one state cannot see a
transition at all. I could write each one as a flag that the action sets, and
then the model would be marking its own homework.

So they live in `packages/machine/src/replay.test.ts` instead, where the thing
being asked is the real class:

| | |
| --- | --- |
| 3 | every `onEnter` is followed by exactly one `onLeave`, steps and stories |
| 4 | every `previous` in the `onStep` chain is where the last report arrived |
| 5 | no signal advances a step the presenter has never been given |
| 6 | a callback settling for a position the tour has left changes nothing |
| 7 | while the phase is closed no call from the application changes anything |

The model's job for those five is to reach the state where the question can be
asked, and then to say what the answer should be.

## What it found

Nothing in `machine.ts`. All 87 tests were green the first time the replay ran.

What it found was three holes in the tests. I broke `machine.ts` on purpose and
watched what caught it:

| What I broke | 76 hand-written tests, before | A replayed trace |
| --- | --- | --- |
| `accepting` returns true during an arrival | yes | yes |
| `draw` drops the `this.showing !== showing` check | yes | yes |
| `advance` runs `validate` on a step that declares `awaits` | yes | yes |
| `end` forgets to clear `announced` | yes | no |
| `draw`'s settle writes `ready` over a `searching` phase | **no** | yes |
| `seek` accepts a search for a step the tour has left | **no** | yes |
| `lose` accepts a loss for a step the tour has left | **no** | yes |

The bottom three all need a presenter reporting about a step the tour has
already walked away from. That is a real thing. `presenter.ts` watches the step
it was shown, and the tour can move while the observer is still armed. I had
written that down in the JSDoc on `Host.lost` and never written a test for it.

All three have one in `machine.test.ts` now, in the `what the tour says it is
doing` group. A trace says a call went wrong at state 8. A named test says what
the rule is. I want both, and the traces are what found the rule to name.

Two of the three only became reachable after I changed the model. `doLose` and
`doHunt` started out asking `m.position == Just(at)` first, so the search never
made a report about a step nobody was standing on. That is the shape of the work
here. The model is where I write down what can happen, and getting that list
wrong is how this fails.

## The world, and how big it is

Four stories and six steps between them. Two signals a call site can report, and
one more that nothing waits for. Four targets on the page.

| Story | Steps | What it is for |
| --- | --- | --- |
| `a` | `a1`, `a2`, `a3` | the ordinary run. A control, then a signal through a slow `onEnter`, then a control behind a guard |
| `b` | `b1`, `b2` | a story whose own `onEnter` is slow, and a step that throws on the way in |
| `c` | `c1` | a story whose own `onEnter` throws |
| `d` | none | `start` has to refuse it without tearing down whatever is running |

`a2` declares both `awaits` and a guard, because the guard is meant to be
ignored on a step that declares `awaits`.

The world is a `var` written once in `init` rather than a `pure val`. That puts
it into every state of the trace, and `replay.test.ts` builds its fixture out of
the trace. Otherwise the fixture would be written twice and the two copies would
drift apart, which is the largest drift surface there is.

## Two searches

`quint run` picks uniformly among the actions that are enabled. `stop` is
enabled almost always, so a tour gets torn down roughly every thirteenth call
and hardly ever reaches its third step. In 200000 traces of 30 steps, the state
where a guard failed and the handler wrote a message came up 11 times.

So there are two.

- `init` with `step` is everything, from idle. This is the honest one, and it is
  where the four bugs the issue was opened for would have been. All four were
  reachable in under five calls.
- `initRunning` with `stepInside` starts with story `a` already running and
  leaves out `setStory`, `start` and `stop`. Under this one the same state came
  up 1422 times in 100000.

`pnpm model` runs both. Neither is enough on its own.

## Witnesses

`quint run --witnesses` counts how many traces reached a predicate. It reports
rather than fails, so `scripts/model-check.mjs` reads the counts and fails on a
zero.

This is the drift alarm. If somebody changes the model and an action stops being
reachable, every run after that is green about nothing, and a witness at zero is
the only thing that says so. The counts are added across both searches, because
each search reaches things the other almost never does.

## The corpus

`traces/` holds 10 traces. Each one was harvested by handing `quint run` the
negation of a target as its invariant. The shortest thing that breaks "this
never happens" is a trace where it does.

`replay.test.ts` reads every `.itf.json` in that directory and drives the calls
into a real `Machine` over the `Fake` presenter from `src/fake.ts`. After every
call it holds the machine against the model: `state`, the story, the index, what
is on screen, and the step `onStep` last named.

A trace ends at the state its target names. That matters more than it sounds.
The first version of the `morph-under-search` target named the state *before*
the settle, so the trace stopped one call short of the call it existed to make,
and the broken `machine.ts` passed. That is what `mark` in the model is for. It
names which way an action went, so a target can be the state after the
transition rather than the state before it.

To add one, put an entry in `HARVEST` in `scripts/model-traces.mjs` with a
target and a seed, then run `pnpm model:traces`. The seeds are fixed so the
files are reproducible and a diff means something. They are not portable across
Quint versions, which is why regenerating is a command somebody runs rather than
something CI checks. The version is pinned exactly in the root `package.json`.

## When `pnpm model` fails

The run prints `--seed=0x…`. Reproduce with it:

```bash
node_modules/.bin/quint run packages/machine/model/machine.qnt \
  --invariants runningIsDrawn idleIsClean \
  --max-steps=24 --max-samples=100000 --seed=0x... --verbosity=3
```

The seeds are fresh every run, so a CI failure here will not reproduce from the
workflow file. That is a fuzzer working. Do not file it as flake.

Then work out which of the two is wrong. If the code is wrong, fix the code and
add a trace to the corpus so the fix stays fixed. If the model is wrong, fix the
model and say so in the commit, because a model that lies is worse than no
model.

## When a replay diverges

The failure names the state and the call: `state 8, after doSettle
(morph-under-search)`. The model and the code disagree about what that call
does. One of them is wrong. Read the state in the `.itf.json` alongside the
method in `machine.ts` that the model definition is named after. Every pure
function in `machine.qnt` carries the name of the method it stands for.

## What this does not cover

- `quint verify`. Exhaustive checking wants Apalache and a JVM, and I have not
  tried it. Everything here is random simulation.
- A deferred `onValidationError`. `errorUtils` holds the position so that a
  handler answering a second late is dropped, and the model calls the handler
  synchronously. This is the next thing I would add.
- `watch()` and the microtask that carries it. No watchers are attached in the
  replay.
- The `animate` flag, the words on a step, the diagnostic payloads. Only the
  count of diagnostics is checked.
- A misconception shared by the model and the code. Nothing can catch that. The
  model is 675 lines and small enough to read, and that is the whole of the
  defence.
