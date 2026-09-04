# A model of the presenter's plan

`plan.qnt` is `packages/leko/src/plan.ts` written down as a state machine, in
[Quint](https://quint.sh/). A search walks it looking for a state that breaks one
of its invariants. It is the presenter's half of what
[`packages/machine/model/`](../../machine/model/) is for the machine, and that
README says most of what there is to say about the method; this one says what is
different here.

It was written for the reason the machine's was, one step later. The machine's
model came when `machine.test.ts` had grown past what reading could hold. The
plan is one file and its transitions are small, and the first version of it
still carried three findings to review, every one an event landing in a mode
the author had not enumerated: a `replace` owed beside a `say` that assumed it
had succeeded, a resize during a glide begun from a retry restoring nothing, a
`retell` arriving in `retrying`. A review caught them once. A review does not
scale the way a search does, and `plan.test.ts` checks one of the plan's rules
only as far as the examples somebody wrote happen to reach.

## Running it

```bash
pnpm model          # both models: search for a state that breaks an invariant
```

`pnpm model` runs this after the machine's model, from the same script. It takes
fifteen to thirty seconds depending on the machine, needs no JVM, and runs in
CI. One search rather than the machine's two: `teardown` is one action in eight
and every witness below is reached from `init`, the rarest in over a thousand of
the 100,000 traces.

## What is modelled

The state is `Mode` as `plan.ts` has it — `idle`, `drawn`, `retrying`,
`gliding`, with `pending`, `error` and `standing` where the type carries them.
The two identities the plan compares become tokens off a counter, the way
`Position`'s object identity became `occurrence` in `machine.qnt`: a `Pending`
is told from a stale one on `expired`, and a `Glide` from a stale one on
`settled`, by a number the plan gets from `{}` for free.

Alongside it, the model says out loud what the shell keeps implicitly, which is
the move `machine.qnt` made with `drawn`, `presenterUp` and `inflight`:

| | `presenter.ts` |
| --- | --- |
| `watcher` | the one `MutationObserver`, and whether it watches a step's target or hunts for one |
| `deadline` | the timer on a retry, and which `Pending` it was set for |
| `screen` | the step whose cutouts the innermost scrim holds |
| `messageUp` | whether the message is visible |
| `onPage` | whether anything of the tour — layers, the way out, the ring — is on the page |
| `morphing` | the morph in flight, by the step it draws |
| `moving` | the glides running: minted and neither abandoned nor landed |

Those are what the invariants read. `perform` in the model is `perform` in
`presenter.ts` as what each effect does to them, and it is the closest thing
here to the fake effect interpreter stage 2 will replay against.

The knobs on the world are three, and each is a fact the shell reads off the
page and carries into an event as data: whether a target resolved (the page as
a set of names, written by every event that saw it), whether `bringIntoView`
had somewhere to go, and whether a draw found anything to measure and applied
its morph outright. An action picks them, because a pure function cannot.

## The machine is modelled loose

`show`, `retell` and `teardown` come from the machine, and the model does not
copy the machine's call discipline: each is offered in every mode, about any
step. That is deliberate, and it is the same bargain `machine.qnt` strikes by
carrying the page as a set of names rather than a DOM.

A `retell` into `retrying` is close to unreachable as the machine stands — the
`validate` effect in `machine.ts` resolves the anchor first, and a missing one
is `lost` rather than a refusal — and the plan handles the entrance anyway, by
storing the reason on the mode. The doc on the `retell` case says so. A loose
machine asks the cheaper question, whether anything breaks if the event
arrives, and does not have to be rewritten when the machine's discipline moves.

The one place the machine's answer is fixed is `lost`. The machine ends the run
on it and tears the presenter down from inside the call, and the model does
the same, because every move the machine makes reaches the presenter as a
`show` or a `teardown` first: the step the presenter gives up on is always the
step the machine is standing on. Letting the machine ignore it would put a
tour on the page with the mode saying `idle`, and that would be a finding about
the model rather than about the code.

The page's own events are offered where the shell would hear them and no
wider: a `mutated` while the observer is armed, a `morphed` for the morph in
flight, a `settled` or an `expired` for anything ever minted. The last two are
the loose ones. In a browser an abandoned glide never settles and a landed one
settled once, and a deadline is cleared before every wait that ends, so a stale
report of either is unreachable. The plan compares all the same, and the model
offers them so that the comparison is exercised rather than assumed.

## Re-entry, and how deep

Three effects come back into the plan from inside the shell: `reveal` reports
`unmeasured` or `morphed` from inside itself, `arrive` is a `show`, and `lost`
is a teardown from inside the machine's call. Quint has no recursion, so the
interpreter is unrolled — `dispatch`, `dispatch2`, `dispatch3` — as deep as the
plan nests, and an effect of the third level's outcome that came back in marks
the state `deep` instead of running. `boundedReentry` says that never happened.
A plan that nests further wants another level, not a quieter model.

The deepest chain as the plan stands is a hunt finding its target: `mutated`
owes an `arrive`, the `show` it makes owes a `reveal`, and the `reveal` reports
`unmeasured` or `morphed`. Three deep.

## What is checked, and where

The sentences that were prose on the old presenter are the `Mode` type now, so
the type already refuses most of what the old invariants forbade. What is left
for a state predicate to hold is the mode against the implicit state:

| | |
| --- | --- |
| `screenIsTheModes` | what is on the page is what the mode says: nothing in `idle`, the step in `drawn`, `standing` in `retrying` and `gliding` |
| `armedIsTheModes` | a deadline is armed exactly in `retrying`, for the `pending` it holds; the observer watches in `drawn`, hunts in `retrying`, and is off otherwise |
| `glidingIsBare` | `gliding` has the message hidden, and its glide is the only one moving the page |
| `idleIsClean` | `idle` has nothing on the page, no words and no morph |
| `boundedReentry` | nothing came back in deeper than the interpreter unrolls |

One more is a predicate over an `Outcome` rather than a state, and it is the
gap the issue was most concerned with:

| | |
| --- | --- |
| `reentrantIsLast` | in every effect list any `reduce` produced, `reveal`, `arrive` and `lost` come last |

`plan.test.ts` asserts that on every outcome the suite sees, which is only the
`(mode, event)` pairs somebody wrote an example for. The model keeps the
effects each `reduce` of the last action owed and asks it of every outcome any
trace reaches.

The claims about what a *transition* did — a stale `settled` draws nothing, an
abandoned glide never moves the page again, an `expired` for a wait that ended
is answered with nothing however long ago it was set — are stage 2's, and go
into a harvested corpus replayed against the real `reduce`. The witnesses below
are what will aim the harvest.

## What it found

Nothing in `plan.ts`. Every invariant held over 100,000 traces of 24 steps.

What it can see was measured the way the machine's was: break the model on
purpose and watch whether the search notices. Each row is one edit to
`plan.qnt`, searched for 20,000 traces.

| What was broken | Caught by |
| --- | --- |
| a glide begun from a retry inherits no `standing` — the second review finding | `screenIsTheModes`, in 156ms |
| a `settled` that lands on nothing forgets `standing` | `screenIsTheModes`, in 152ms |
| a resize mid-glide puts the words back too | `glidingIsBare`, in 88ms |
| a `show` over a glide leaves the glide running | `glidingIsBare`, in 58ms |
| `reveal` owed before `watch` rather than after | `reentrantIsLast`, in 51ms |
| `expired` forgets to `disarm` before `lost` | **nothing** |

The last row is the honest one. The `disarm` in the `expired` case is
belt-and-braces: `lost` ends the run, the teardown that arrives from inside the
call disarms the observer itself, and the state the search rests in is clean
either way. A search sees states, and there is no state in which that `disarm`
did anything. It stays in `plan.ts` because it costs nothing and says what the
case means; the model is what says it is not load-bearing.

## The world, and how big it is

Three steps: two that point at a target of their own, and one that points at
nothing and is drawn on the document with no hole. One reason a guard ever
gives. The plan compares steps and never targets, so two steps sharing a target
would add nothing, and which words a guard gives is not the question — that
they are held on the mode and said where the step is drawn, is.

The state is sixteen fields: `mode`, the seven the shell keeps implicitly, the
three the stale reports draw on (`glides`, `waits`, `nextToken`), the page, and
four for reading the last action — which mode it found, which way each `reduce`
it ran went, the effects each owed, and whether the interpreter ran out of
depth.

## Witnesses

`quint run --witnesses` counts how many traces reached a predicate. It reports
rather than fails, so `scripts/model-check.mjs` reads the counts and fails on a
zero, for this model as for the machine's.

There is one per branch of `reduce` a trace can reach, read off the mark each
branch writes. `unmeasured-ignored` is the one branch without: `unmeasured`
only ever arrives from inside `reveal`, against the `drawn` that reveal just
committed, so the stale-`unmeasured` guard in `plan.ts` is exercised by nothing,
here or anywhere, and a witness for it would sit at zero for ever.

A few more are the pair of a mark and the mode it landed in. Two of the three
review findings were entrances of that shape — a glide begun from a retry, a
`retell` arriving in `retrying` — and `glideFromRetry`, `resizedInGlide` and
`retellInRetry` are those; `showOverGlide`, `showOverRetry`, `retellInGlide`,
`teardownFromGlide`, `teardownFromRetry` and `landedWithReason` are the other
entrances of the same class. The first finding, a `replace` owed beside a `say`
that assumed it had succeeded, is the shape of the `Effect` type now — `replace`
carries `saying` — and has no witness because there is no longer a branch to
reach.

`scripts/model-check.mjs` reads the witnesses, and the invariants, out of this
file: every `val` under the heading of that name. A list kept in the script
would be a second copy, and a `val` added to one and not the other would be
neither checked nor alarmed on.

A witness at zero is a model whose actions have stopped describing the code,
and every run since is green about nothing.

## When `pnpm model` fails

The run prints `--seed=0x…`. Reproduce with it:

```bash
node_modules/.bin/quint run packages/leko/model/plan.qnt \
  --invariants screenIsTheModes armedIsTheModes glidingIsBare idleIsClean reentrantIsLast boundedReentry \
  --max-steps=24 --max-samples=100000 --seed=0x... --verbosity=3
```

The seeds are fresh every run, so a CI failure here will not reproduce from the
workflow file. That is a fuzzer working. Do not file it as flake.

Then work out which of the two is wrong. Every definition in `plan.qnt` that
mirrors one in `plan.ts` carries its name: `reduce`, `leaving`, `standingIn`,
`retrying`, `revealing`. `perform` mirrors `perform` in `presenter.ts`. If the
code is wrong, fix the code; if the model is wrong, fix the model and say so in
the commit, because a model that lies is worse than no model.

## What it does not cover

- Geometry, message placement, layer stacking, the morph's pixels, and the
  shell's `switch` itself. `wiring.test.ts` and `leko.test.ts` hold those in
  real browsers, and the pure functions in `packages/spotlight` have tests of
  their own.
- Which words are on the message. `messageUp` is a bool. Every step in the
  world has words, so `say` always shows the box, and a step whose message is
  empty and declares `awaits` — the one case `say` hides it — is not here.
- What stands after `unmeasured`. The stack may or may not have been rebuilt on
  the way to finding nothing, and the model takes the plan's word that nothing
  it knows of stands: `screen` and `morphing` are cleared. A stack that was
  kept leaves the old holes standing through a retry the plan cannot put back
  on a resize, for the 100ms until it ends. `unmeasured` is unreachable as far
  as anyone can tell, and this is the one place the model chooses the reading
  that keeps the invariant strict rather than the one that would weaken it.
- `replace` failing to measure. `DomPresenter.replace` has the same exit after
  the target resolved — the way out placed, no holes, no words, no event — and
  it is unreachable for the same reason: `resolveTargets` is `resolveTarget`
  over a list, so a first region whose first element resolved a moment ago has
  a box. The model's `Replace` takes it that measuring succeeds, and reads no
  knob for it.
- Whether a `mutated` for a watched target means the target left or was
  replaced. The page is a set of names, and a replacement has the same name.
- The transitions. A stale `settled` drawing nothing, an abandoned glide never
  moving the page again, a late `expired` answered with nothing: those are
  claims about what a call did, not about a state, and they wait for the
  corpus.
- Any depth at all, in the sense of a finished search. `nextToken` grows and
  nothing resets it, so the state space is infinite and only a bound is on
  offer. `quint verify` has not been run against this model.
- A misconception shared by the model and the code. Nothing can catch that. The
  model is small enough to read, and that is the whole of the defence.
