# A model of the presenter's plan

`plan.qnt` is `packages/presenter/src/plan.ts` written down as a state machine, in
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
scale the way a search does, and `plan.test.ts` reaches only the `(mode, event)`
pairs somebody wrote an example for.

## Running it

```bash
pnpm model          # both models: search for a state that breaks an invariant
pnpm model:traces   # regenerate the corpora under traces/, both models
pnpm test           # among other things, replay this one's
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
| `watcher` | the one `MutationObserver`, armed for a hunt and for nothing else, and which step it is hunting for |
| `deadline` | the timer on a retry, and which `Pending` it was set for |
| `screen` | the step whose cutouts the innermost scrim holds |
| `messageUp` | whether the message is visible |
| `onPage` | whether anything of the tour — layers, the way out, the ring — is on the page |
| `morphing` | the morph in flight, by the step it draws |
| `moving` | the glides running: minted and neither abandoned nor landed |

Those are what the invariants read. `perform` and `reenter` in the model are
`perform` in `presenter.ts` as what each effect does to them, and they are the
closest thing here to the fake effect interpreter stage 2 will replay against.

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

Four effects come back into the plan from inside the shell: `reveal` reports
`unmeasured` or `morphed` from inside itself, `replace` reports `resolved`,
`arrive` is a `show`, and `lost` is a teardown from inside the machine's call.
An `Outcome` carries at most one of them, in `last`, and the shell performs it
after every other effect, so the order is the type's and nothing checks it.
Quint has no recursion, so the interpreter is unrolled — `dispatch`,
`dispatch2`, `dispatch3` — as deep as the plan nests, and an effect of the
third level's outcome that came back in marks the state `deep` instead of
running. `boundedReentry` says that never happened. A plan that nests further
wants another level, not a quieter model.

The deepest chain as the plan stands is a hunt finding its target: `mutated`
owes an `arrive`, the `show` it makes owes a `reveal`, and the `reveal` reports
`unmeasured` or `morphed`. Three deep. A resize is two: `resized` owes a
`replace`, and the answer comes back as `resolved`.

## What is checked, and where

The sentences that were prose on the old presenter are the `Mode` type now, so
the type already refuses most of what the old invariants forbade. What is left
for a state predicate to hold is the mode against the implicit state:

| | |
| --- | --- |
| `screenIsTheModes` | what is on the page is what the mode says: nothing in `idle`, the step in `drawn`, `standing` in `retrying` and `gliding` |
| `armedIsTheModes` | a deadline is armed exactly in `retrying`, for the `pending` it holds; the observer hunts in `retrying` and is off in every other mode, a step on screen included |
| `glidingIsBare` | `gliding` has the message hidden, and its glide is the only one moving the page |
| `idleIsClean` | `idle` has nothing on the page, no words and no morph |
| `boundedReentry` | nothing came back in deeper than the interpreter unrolls |
| `worldIsFixed` | the step table never changes, which is what lets `pointsAt` read it off the `pure val` while everything with a state reads the variable |

What used to be `reentrantIsLast` is the shape of `Outcome` now — `effects`
cannot hold `reveal`, `replace`, `arrive` or `lost`, and `last` holds at most
one — the way `redraw` carrying `saying` retired the first review finding.

The claims about what a *transition* did cannot be seen by a predicate over one
state at all, and writing them into the model as a flag an action sets would
make them true by construction. They live in
[`../src/replay.test.ts`](../src/replay.test.ts), where the thing being asked is
the real `reduce`:

| | |
| --- | --- |
| 1 | a stale `settled` draws nothing, and moves nothing |
| 2 | an abandoned glide is told to stop, and never moves the page again, and nothing but the glide the mode holds is still carrying it |
| 3 | an `expired` for a wait that ended is answered with nothing, however long ago it was set |
| 3b | an `expired` that runs out onto a target that has turned up arrives at it rather than giving it up |
| 3c | an `expired` for a wait a draw began gives its target up rather than arriving at it, whatever the last question answers |
| 4 | a `resized` mid-glide puts the standing holes back and says nothing |

The model's job for those is to reach the state where the question can be
asked, and the witnesses below are what aim the harvest.

## The corpus

`traces/` holds 18 traces, harvested the way the machine's are: `quint run` is
handed the negation of a target as its invariant, and the shortest thing that
breaks "this never happens" is a trace where it does. The targets and the seeds
are in `HARVEST` in `scripts/model-traces.mjs`, under this model's entry.

`../src/replay.test.ts` reads every `.itf.json` in that directory and drives the
events into the real `reduce`, with a fake interpreter standing in for the
shell. The machine's replay is a real `Machine` over a fake presenter; this is
that arrangement inverted, and it is lighter than the machine's was — nothing
here is asynchronous, there is no teardown window to drain, and no browser is
involved.

After every event the oracle runs in two halves. First **what each `reduce`
owed**: the effect lists the real plan produced, against the ones the model's
`reduce` produced, rendered to a shape both can be written to — an anchor
becomes whether there was one, a `Glide` becomes the model's token for it, a
step becomes its id. Then **the state performing them left**: the mode and what
it carries, the watcher and what it is armed for, the deadline, what is on the
page, the words, the morph, the glides and the page itself. The glides by
identity rather than by number: a `show` over a glide abandons one and mints
another, so a mode left holding the abandoned one runs the same count and owes
the same effects, and which token the mode holds is the only thing that tells
the two apart.

Both halves, because two effects can leave the same footprint. A `say` owed
where a `retell` was re-places the message box instead of swapping its words —
which is the jump out from under a reader that `retold` exists to prevent — and
either way the message ends up showing. The state comparison alone sees
nothing there. Neither half is the model checking itself: the shell is driven
by the effects the **real** `reduce` owed.

The identities are what the trace cannot carry. A `Pending` is an object the
plan mints per wait and a `Glide` is one the shell mints per scroll, and both
are told from a stale one with `!==`. The model numbers them; the replay reads
the number off the mode the plan just committed and ties it to the object, so a
`settled` for glide 0 five states later is dispatched with the object glide 0
was. That is what makes claims 1 and 3 mean anything.

They are tied by order rather than by reading whichever mode an action ended
in. Both sides take every token off one counter that only goes up, so the nth
glide the shell minted is the nth token the model added, whatever depth of
re-entry either was reached at. A count that disagrees is the harness having
stopped following the plan — a different thing from a corpus that is wrong —
and it says so rather than failing later on a lookup.

The world is in each trace's header rather than in every state. It is a model
variable so that it reaches the trace at all, which is what lets the fixture be
built from the trace rather than written a second time by hand; it is written
once in `init`, so `scripts/model-traces.mjs` writes it once too, and
`worldIsFixed` is the invariant that says it stays that way.

## What it found

Nothing in `plan.ts`. Every invariant held over 100,000 traces of 24 steps, and
every trace replayed green against the real `reduce` the first time it ran.

What the search can see was measured the way the machine's was: break the model
on purpose and watch whether it notices. Each row is one edit to `plan.qnt`,
searched for 20,000 traces.

| What was broken | Caught by |
| --- | --- |
| a glide begun from a retry inherits no `standing` — the second review finding | `screenIsTheModes`, in 156ms |
| a `settled` that lands on nothing forgets `standing` | `screenIsTheModes`, in 152ms |
| a resize mid-glide puts the words back too | `glidingIsBare`, in 88ms |
| a `show` over a glide leaves the glide running | `glidingIsBare`, in 58ms |
| `reveal` owed before `disarm` rather than after | **cannot be written**: `effects` is `List[Effect]` and `Reveal` is not one |
| `expired` forgets to `disarm` before `lost` | **nothing** |

The last row is the honest one. The `disarm` in the `expired` case is
belt-and-braces: `lost` ends the run, the teardown that arrives from inside the
call disarms the observer itself, and the state the search rests in is clean
either way. A search sees states, and there is no state in which that `disarm`
did anything. It stays in `plan.ts` because it costs nothing and says what the
case means; the model is what says it is not load-bearing.

## What the corpus found, and what it did not

The same exercise against the code rather than the model: twenty edits to
`plan.ts`, each run past `plan.test.ts` and past the replay separately. Ten of
them were the obvious ones and both suites caught all ten. These are the other
ten, and they are where the two differ.

| What was broken in `plan.ts` | `plan.test.ts` | A replayed trace |
| --- | --- | --- |
| a hunt takes a batch about a step it is not looking for | **no** | yes |
| a `show` over a glide keeps the abandoned glide on the new mode | **no** | yes |
| a `retell` on the step on screen owes a `say` instead | yes | yes |
| an unmeasured draw retries with the step it failed to draw standing | yes | yes |
| a `retell` mid-glide is dropped instead of held | yes | yes |
| a hunt that arrives drops what the wait was told | yes | yes |
| what stands behind a glide is the step on its way | yes | yes |
| a retry keeps the watcher it had rather than hunting | yes | yes |
| a teardown leaves the watcher armed | yes | yes |
| a morph landing is not checked against the step it drew | yes | **no** |
| an unmeasured report is not checked against the step it drew | yes | **no** |

The first row is what the corpus is for. `plan.test.ts` drives one `(mode,
event)` pair at a time and had no example of a hunt hearing about another step,
so a plan that answered one went green. `mutated-elsewhere` is the mark for it
now, and `hunt-elsewhere` is the trace.

The second cost a trace and a field on the oracle, and it is the sharpest thing
here. A `show` that glides, made while the page is already gliding, is the one
state where two glides are alive at once, and no trace reached it: `showOverGlide`
admits that state, but its seed landed on a `show` that retried instead. So a
mode holding the abandoned glide looked exactly like one holding the right glide
— same effects, same number still running — and every trace replayed green.
`glide-over-glide` is the trace, `glideOverGlide` the state it aims at, and the
oracle now compares which glide the mode holds rather than how many are running.
In a browser that mutant is a hang rather than a cosmetic slip: the new glide
settles, the mode is holding the old one, `reduce` answers with nothing, and the
step never draws on a page that has already scrolled to it.

The third is what the effect half of the oracle is for, and it went green against
every trace while the oracle read state alone. A `say` and a `retell` both end
with the message showing.

One row arrived late. A glide begun from a retry that had **nothing** standing
looks exactly like one that inherited nothing at all, so the first corpus
replayed green against a plan that dropped `standing` on the way;
`glideOverStanding` is the state that tells them apart, and it is a trace now.
How a draw was to animate is only ever visible again when the draw fails to
measure and the `Pending` carries it into a retry, which is `unmeasured-retry`
and has a trace of its own.

The last two rows are the honest ones, and they are the same shape as the
`disarm` row above. Each is a guard on a state the model says is unreachable:

```
--invariant='not(went(m, "morphed-stale") and kindOf(m.mode) == "drawn")'
[ok] No violation found (13624ms)
--invariant='not(went(m, "unmeasured-ignored"))'
[ok] No violation found (14456ms)
```

200,000 traces each, 24 steps, and neither state once. A morph is halted by
every redraw and every `replace`, so the only `morphed` that arrives is the one
for the step on screen; an `unmeasured` is dispatched from inside `reveal`
against the mode `reveal` has just committed. A replay can only reach states the
model can reach. A hand-written test can build any state at all, and that is why
both suites are here: `plan.test.ts` says what the rule is, and the corpus finds
the rules nobody thought to name.

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
branch writes. One branch has two marks: `plan.ts` turns down a batch about a
step the hunt is not looking for and a batch that found nothing in the same
condition, and `mutated-elsewhere` and `mutated-ignored` are the two halves
worth aiming at, the way `advance` in `machine.qnt` tells `refuse-said` from
`refuse-mute`.

Two branches have no witness, and each is a guard the model cannot reach.
`unmeasured-ignored`: `unmeasured` only ever arrives from inside `reveal`,
against the `drawn` that reveal just committed, so the stale-`unmeasured` guard
in `plan.ts` is exercised by nothing, here or anywhere. `mutated-unarmed`: a
hunt is armed in `retrying` and nowhere else — a step on screen arms nothing —
so a batch can only ever land on `retrying`, and the arm that turns down one
landing anywhere else is the defence against an observer already disconnected.
A witness for either would sit at zero for ever.

A few more are the pair of a mark and the mode it landed in. Two of the three
review findings were entrances of that shape — a glide begun from a retry, a
`retell` arriving in `retrying` — and `glideFromRetry`, `resizedInGlide` and
`retellInRetry` are those; `showOverGlide`, `showOverRetry`, `retellInGlide`,
`teardownFromGlide`, `teardownFromRetry` and `landedWithReason` are the other
entrances of the same class. The first finding, a `replace` owed beside a `say`
that assumed it had succeeded, is the shape of the `Effect` type now — `redraw`
carries `saying` — and has no witness because there is no longer a branch to
reach.

Two more exist because the replay asked for them rather than the search:
`glideOverStanding` and `mutatedElsewhere` are each a state in which a plan that
had got something wrong would otherwise have looked exactly like one that had
not. The section above says what each was found by.

`scripts/model-check.mjs` reads the witnesses, and the invariants, out of this
file: every `val` under the heading of that name. A list kept in the script
would be a second copy, and a `val` added to one and not the other would be
neither checked nor alarmed on.

A witness at zero is a model whose actions have stopped describing the code,
and every run since is green about nothing.

## When a replay diverges

The failure names the state and the call: `state 8, after doSettled
(settled-retry)`. The model and the code disagree about what that event did.
One of them is wrong. Read the state in the `.itf.json` alongside the definition
it is named after: every mark in `plan.qnt` names the branch of `reduce` it
stands for, `perform` there is `perform` in `presenter.ts`, and the fake shell
in `replay.test.ts` is that same `perform` in TypeScript.

A divergence in the identities reads differently — a `settled` or an `expired`
that should have been answered with nothing and was not. Those are claims 1 to
3 above, and they fail with a message rather than a field comparison.

## When `pnpm model` fails

The run prints `pnpm model --seed=0x…`. Reproduce with it:

```bash
pnpm model --seed=0x...
```

That is the same script with the same invariants — every `val` under the
`invariants` heading of `plan.qnt`, read the way CI reads them — replaying the
one sample the seed names through each search, and printing the counterexample
under the search that broke. The other searches pass and say so in one line.

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
- A redraw failing to measure. `DomPresenter.redraw` has the same exit after
  the target resolved — the way out placed, no holes, no words, no event — and
  it is unreachable for the same reason: `resolveTargets` is `resolveTarget`
  over a list, so a first region whose first element resolved a moment ago has
  a box. The model's `Redraw` takes it that measuring succeeds, and reads no
  knob for it.
- Anything the corpus does not reach. The replay drives the traces under
  `traces/` and no other path, so a claim about a transition is checked exactly
  where a trace goes. `traces/` is 18 of them, and the search is what aimed each.
- Any depth at all, in the sense of a finished search. `nextToken` grows and
  nothing resets it, so the state space is infinite and only a bound is on
  offer. `quint verify` has not been run against this model.
- A misconception shared by the model and the code. Nothing can catch that. The
  model is small enough to read, and that is the whole of the defence.
