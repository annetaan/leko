# A model of the machine

`machine.qnt` is `packages/machine/src/plan.ts` written down as a state machine,
in [Quint](https://quint.sh/). A search walks it looking for a state that breaks
one of its invariants, and the traces it finds are replayed against the real
class. [`phases.md`](phases.md) is the same machine as a picture.

It was written against `machine.ts`, when that file held the state, the
decisions and the calls all at once. The two have grown closer since. `plan.ts`
takes an event and a state and answers with a state, which is the shape this
model was always in.

I wrote it because `machine.test.ts` had grown to 1901 lines and every one of
them was an example I had thought of. It is 1943 now: the presenter the tests
drive moved to `src/fake.ts` so the replay could share it, and the searches keep
coming back with something. Four bugs turned up in one week that I had not
thought of. All four were reachable in under five calls. Reading does not scale
past about 700 lines, so I wanted something that searches.

## Running it

```bash
pnpm model          # search for a state that breaks an invariant
pnpm model:traces   # regenerate the corpus under traces/
pnpm test           # among other things, replay the corpus
```

`pnpm model` takes about 10 seconds here and runs in CI. It needs no JVM.
Quint's Rust backend is the default and comes with the npm package, and only
`quint verify` wants Apalache and a Java runtime.

## Verifying it

`pnpm model` samples 200,000 runs and reports that none of them broke an
invariant. A bug deeper than the sample reached is still a bug it never saw.
`quint verify` answers the other question, up to a depth you pick. It hands the
model to [Apalache](https://apalache.informal.systems/), which asks Z3 whether
an invariant can be broken at all.

I run it by hand after a change to the model. Last on 2026-08-29:

```bash
brew install openjdk@21
JAVA_HOME=/opt/homebrew/opt/openjdk@21 \
  PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" \
  ./node_modules/.bin/quint verify packages/machine/model/machine.qnt \
    --invariants runningIsDrawn idleIsClean --max-steps=8
```

```
Step 8: picking a transition out of 6 transition(s)
The outcome is: NoError
[ok] No violation found (274192ms).
```

4 minutes 34 seconds. Nothing within 8 calls of `init` breaks either invariant,
and that is a proof over the whole depth rather than a sample of it. Quint
downloads Apalache 0.56.1 itself. The JVM is the only thing to install, and
`openjdk@21` is keg-only, so the system `java` stays as it was.

`step` offers 6 actions, which is the number Apalache prints on the line above.
Count the `nondet` picks and it is 19 branches from a state with nothing in
flight, and one more for every teardown window that is open, because `doLeave`
picks out of `inflight`. So 8 steps is around 19^8, or 17 billion paths.
Apalache walks none of them. The picks stay as variables in the SMT problem and
it asks about all 19 at once, which is the whole reason 8 steps finishes at all.

**Read a total as a sample of one.** The six invariant checks at step 8 in that
run took 22s, 23s, 10s, 0.1s, 21s and 17s. Six instances of the same question,
and one of them was answered before the clock could measure it. What Z3 pays for
is the shape of the instance it is handed, so a run that finishes in four
minutes today can take half an hour after a change that made the model smaller.

Taking actions off the transition relation is what has moved this number:
1910321ms with 11 of them, then 826339ms with 9, 303590ms with 7, and this.
Folding an arrival into one synchronous action went the other way, because it
made each transition deeper while making the reachable states fewer.

Do not put it in CI. `pnpm model:traces` searches 24 steps, and that is out of
reach here.

## What is checked, and where

Only two of the seven claims I started with are things a state predicate can
see. Those two live here:

| | |
| --- | --- |
| `runningIsDrawn` | `state == "running"` means there is a step and the presenter has it |
| `idleIsClean` | `state == "idle"` means everything is empty and the presenter is down |

The other five are claims about what a *transition* did. "Nothing moved while
the gate was closed." "Exactly one `onLeave` per `onEnter`." A predicate over one
state cannot see a transition at all. I could write each one as a flag that the action sets, and
then the model would be marking its own homework.

So they live in `packages/machine/src/replay.test.ts` instead, where the thing
being asked is the real class:

| | |
| --- | --- |
| 3 | every `onEnter` is followed by exactly one `onLeave`, steps and stories |
| 4 | no signal advances a step the presenter has never been given |
| 5 | a report about a step the tour has left changes nothing |
| 6 | while the phase is closed no call from the application changes anything |
| 7 | a refusal always reaches the presenter, and says why only where the step says so |

The model's job for those is to reach the state where the question can be asked,
and then to say what the answer should be.

Number 8 arrived after the other five, and it used to be about a different
thing. `onValidationError` returned `void`, so a handler could look something up
and call `setError` a second later, by which time the tour may be somewhere
else. That hook is gone. A step declares `error` instead, the machine reads it
in the turn the guard said no, and the shake is derived rather than asked for.
`hasWords` on `StepSpec` is which of the two a step is, and `refuse-said` and
`refuse-mute` are the two marks `advance` leaves behind.

## What it found

Nothing in `machine.ts`. All 87 tests were green the first time the replay ran.

What it found was three holes in the tests. I broke the machine on purpose and
watched what caught it. The hand-written column was 76 tests when the top rows
were measured and 80 when the last one was:

| What I broke | The hand-written tests, before | A replayed trace |
| --- | --- | --- |
| `accepting` returns true during an arrival | yes | yes |
| `draw` drops the `this.showing !== showing` check | yes | yes |
| `advance` runs `validate` on a step that declares `awaits` | yes | yes |
| `draw`'s settle writes `ready` over a `searching` phase | **no** | yes |
| `seek` accepts a search for a step the tour has left | **no** | yes |
| `lose` accepts a loss for a step the tour has left | **no** | yes |
| `end` runs a second teardown when one is already open | **no** | yes |

The bottom three all need a presenter reporting about a step the tour has
already walked away from. That is a real thing. `presenter.ts` watches the step
it was shown, and the tour can move while the observer is still armed. I had
written that down in the JSDoc on `Host.lost` and never written a test for it.

All three have one in `machine.test.ts` now, in the `what the tour says it is
doing` group. A trace says a call went wrong at state 8. A named test says what
the rule is. I want both, and the traces are what found the rule to name.

The last row is the newest and it took the teardown window to reach. `stop()` is
the one call the gate never turns down, and an application is free to make it
from inside its own `onLeave`. `end` refuses that by returning early on an empty
position. Take the early return out and 120 tests stay green, including all 76
hand-written ones. `stop-tearing` is the only thing that says anything.

Opening that window found one more thing, and this one was in the model.
`idleIsClean` said that `state == "idle"` implies `phase == Ready`. It held for
as long as nothing could reach a teardown from the outside. `end` empties the
position before it calls anything, so a handler reading `state` from inside its
own `onLeave` is told `idle` while the phase underneath is still `ending`. The
search broke the old invariant in 30ms. I weakened it. The machine was right,
and `machine.test.ts` has the case that says what a handler sees.

Two of the three only became reachable after I changed the model. `doLose` and
`doHunt` started out asking `m.position == Just(at)` first, so the search never
made a report about a step nobody was standing on. That is the shape of the work
here. The model is where I write down what can happen, and getting that list
wrong is how this fails.

## Where the model was wrong

I read `machine.qnt` against `plan.ts` a definition at a time. Two of them said
something the code does not do.

The first was `stillAt`. `plan.ts` writes `core.position === at`, and `Position`
is an object replaced on every move and on nothing else. So the object is the
step occurrence. The model compared the story and the index and had no
occurrence to compare with. Those two agree until a tour ends and starts the
same story again.

The gap needed a callback outstanding across a teardown and a restart. The
model compared `b/0` with `b/0` and called it the same place; a real `Machine`
was holding the `position` object from before the stop and did nothing at all.

`Pos` carries an `occurrence` now, off the same counter the callbacks take their
tokens from. That made something else wrong. `lost` is answered against
`stepOf(core)` in `plan.ts`, so it compares the step rather than the
position, and `doLose` was comparing the position. With an occurrence in there
it would have started turning down reports the machine takes. It names a `Where`
now, which is a story and an index and no occurrence.

Neither invariant could see any of this. `runningIsDrawn` and `idleIsClean` both
hold in the state the model reached, and no trace in the corpus went there
either. What can still arrive after a restart is a report from the presenter
about the step it was shown, and `stale-report` is the trace for it.

The second was `holding`. `doSetError` and `doShake` each took the utils back
out of the set, so a handler got one answer and no more. `ErrorUtils` is two
closures the machine hands over and never mentions again. A handler can keep one
and use it as often as it likes. I checked: `shake()`, then `setError('one')`,
then `setError('two')` gives 1 reject and 2 retells. The model could not reach
any of that. Nothing takes utils back now.

That last one has since stopped mattering. `onValidationError` and `ErrorUtils`
were both taken out, and with them `holding`, `handOver`, `doSetError` and
`doShake`. The reading that found the bug is still the reading that killed the
feature: a handler that answers late is a handler whose answer is dropped, so
the freedom it had was the freedom to write code that does nothing.

Two smaller ones came out of the same read. `doResize` marked a resize accepted
while nothing was running, and `moved` in `plan.ts` wants a step to place before
it does anything. And the mark for a `start` on an empty story was
`start-refused`, which reads almost exactly like the `refused-start` beside it.
It is `empty-story` now, and `replay.test.ts` counts its one diagnostic the way
it counts the other two.

## The teardown window

`end` empties the machine, takes the presenter down, runs two `onLeave` calls
and reports. Those three are application code, and an application inside one can
call straight back in. `machine.ts` does the whole of it inside whichever call
began it and never goes back to the event loop in the middle.

The model used to do the whole of it in one `pure def`. So it rested either side
of a teardown and never inside one. I asked it directly and it agreed:

```
--invariant='m.phase != Ending'
[ok] No violation found (2447ms at 81733 traces/second)
```

200000 traces, 24 steps, and `ending` never once. Six phases in `plan.ts`, and
the search could reach five.

`end` parks a `Leaving` now, and `doLeave` is the rest of it. Between the two,
the machine is emptied and the phase is closed, which is exactly where
`machine.ts` stands while it runs handlers. Every action is offered there.

That is more permissive than the code, which runs the whole of a teardown inside
the call that began it. Nothing is lost by it. With the position empty and the
phase closed, every action is refused, finds nothing to act on, or is a knob on
the world, so none of them can make a state the code would never reach.

Driving it took more work than modelling it. There is no moment out in the
driver where a call made from inside `onLeave` could be made. So
`replay.test.ts` reads ahead, queues the calls the trace puts in the window, and
`drain` makes them from the handler. It knows it is in a teardown by asking
`tour.state`, which answers `idle` there and `running` in the `onLeave` of a
step the tour is merely walking away from.

Three of the traces put a call in the window, one per way into the machine. A
window only one call has been tried in is a window nobody has really looked
into, and the corpus is written so that every entrance — `start`, `stop`,
`reached` — is used at least once.

## The world, and how big it is

Five stories and eight steps between them. Two signals a call site can report,
and one more that nothing waits for. Four targets on the page. The state is
twelve variables: the four of `Core`, four the code keeps implicitly, and four
that are knobs on the world.

| Story | Steps | What it is for |
| --- | --- | --- |
| `a` | `a1`, `a2`, `a3`, `a4` | the ordinary run. A control, then a signal, then two controls behind a guard. `a3` has `error` written on it and `a4` does not, because a refusal with nothing to say still has to shake the cutout |
| `b` | `b1`, `b2` | a signal, and a step that throws on the way in |
| `c` | `c1` | a story whose own `onEnter` throws |
| `d` | none | `start` has to refuse it without tearing down whatever is running |
| `e` | `e1` | where `a` hands the tour when it runs out, and the end of the chain |

`a2` declares both `awaits` and a guard, because the guard is meant to be
ignored on a step that declares `awaits`.

The world is a `var` written once in `init` rather than a `pure val`. That puts
it into every state of the trace, and `replay.test.ts` builds its fixture out of
the trace. Otherwise the fixture would be written twice and the two copies would
drift apart, which is the largest drift surface there is.

## Two searches

`quint run` picks uniformly among the actions that are enabled. `stop` is
enabled almost always, so a tour gets torn down roughly every sixth call and
hardly ever reaches its third step. In the 100000 traces `pnpm model` walks, the
state where a guard failed and the step had words for it comes up in 266 of
them.

So there are two.

- `init` with `step` is everything, from idle. This is the honest one, and it is
  where the four bugs the issue was opened for would have been. All four were
  reachable in under five calls.
- `initRunning` with `stepInside` starts with story `a` already running and
  leaves out `start` and `stop`. Under this one the same state comes up in 12561
  of the 100000.

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

`traces/` holds 11 traces. Each one was harvested by handing `quint run` the
negation of a target as its invariant. The shortest thing that breaks "this
never happens" is a trace where it does.

`replay.test.ts` reads every `.itf.json` in that directory and drives the calls
into a real `Machine` over the `Fake` presenter from `src/fake.ts`. After every
call it holds the machine against the model: `state`, the story, the index, what
is on screen, and the step `onStep` last named.

A trace ends at the state its target names. That matters more than it sounds. A
target naming the state *before* the call it is about stops the trace one call
short of that call, and a broken `machine.ts` passes. That is what `mark` in the
model is for. It names which way an action went, so a target can be the state
after the transition rather than the state before it.

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

The failure names the state and the call: `state 8, after doLose
(lose-stale)`. The model and the code disagree about what that call
does. One of them is wrong. Read the state in the `.itf.json` alongside the
definition it is named after. Every pure function in `machine.qnt` carries the
name of the thing it stands for, and there are two places to look.

`advance` and `moveOn` are in `plan.ts` under those names, as pure functions
answering with the next state and the calls the machine owes. Three more are
there under different ones. `end` is `ending`, `enter` is `entering`, and
`enterStory` is `opening`. Each doc comment in `machine.qnt` names the one it
stands for, so read the doc rather than trusting the name. Everything else a
state change does is a spread in the `reduce` case that decided it.

`plan.ts` is the closest thing to this model that TypeScript holds. Both take an
event and a state and answer with a state, and both stop where the machine hands
control to the application. `doLeave` here and the `left` event there are the
same boundary.

## What this does not cover

- `quint verify` past 8 steps, and the deep relation at any depth. I ran the
  wide one. `initRunning`/`stepInside` has never been through Apalache.
- Any depth at all, in the sense of a finished search. `park` increments
  `nextToken` and nothing resets it, so the state space is infinite and no
  exhaustive walk of it can stop. A bound is the only thing on offer.
- The `animate` flag, the words on a step, the diagnostic payloads. Only the
  count of diagnostics is checked.
- A story that holds the same step object twice. `plan.ts` answers `lost` by
  comparing the step, and `Machine.index` says in its own doc
  that a story may hold one object twice. Every step in `WORLD` is a different
  record, so the model never sees that. Comparing the step and comparing the
  address give the same answer here, and in a world with a repeated object they
  would not.
- A `reached()` or a `start()` made from inside an `onEnter`. That is the whole
  of what the gate turns down now, and nothing here calls back into the machine
  from a handler. `machine.test.ts` carries those.
- A step that names no target. The machine has no notion of one: `StepBase` has
  no `target`, and what a missing anchor means is a drawing question.
- A misconception shared by the model and the code. Nothing can catch that. The
  model is small enough to read, and that is the whole of the defence.
