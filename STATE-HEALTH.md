# The health of the two state cores

Leko has two pieces of state and they are the same shape. One decides which
step the tour is on; the other decides what is on the screen and what is on its
way there. Each is a pure `plan.ts` — a state, an event union, an effect union
and one `reduce` — with a shell that makes the calls and decides nothing, and
each has a Quint model beside it that a search walks.

This file is a **reading**, not a rule. [DESIGN.md](DESIGN.md) holds the rules
and carries no history; the model READMEs under
[`packages/machine/model/`](packages/machine/model/README.md) and
[`packages/presenter/model/`](packages/presenter/model/README.md) hold the method. What is
here is a set of indicators, an argument for each, and where the two cores stood
on **2026-09-05**, at `07f7f0d`.

**A number is here only if an argument turns on it.** Line counts, test counts
and the size of a union move with every commit and say nothing when they move,
so they are not here; what is here is a ratio, a date, or a count small enough
to be a shape. Each one either has the command that took it under
[Retaking the reading](#retaking-the-reading) or is named there as a reading
rather than a count, so the reading can be taken again and the two compared.

**A count on `main` is not a count of changes.** Every per-commit number below
counts commits on `main`, and a branch that arrives squashed arrives as one.
Settledness reads low for anything that came in that way, and that is a
property of the indicator rather than of the core.

## Why the two are compared at all

Because they are the same shape, one is a yardstick for the other. Both were
extracted from a file that held the state, the decisions and the calls at once;
the machine's was extracted first and has since gone quiet. So the machine is
not only the other core — it is the record of what settling looks like here,
with dates on it. That is what makes "the presenter still changes a lot" a
question with an answer rather than a feeling.

|           | the machine                          | the presenter                                   |
| --------- | ------------------------------------ | ----------------------------------------------- |
| Pure core | `packages/machine/src/plan.ts`       | `packages/presenter/src/plan.ts`                |
| Shell     | `packages/machine/src/machine.ts`    | `packages/presenter/src/presenter.ts`           |
| State     | `Core` — `position` and `phase`      | `Mode` — `idle`, `drawn`, `retrying`, `gliding` |
| Model     | `packages/machine/model/machine.qnt` | `packages/presenter/model/plan.qnt`             |
| Extracted | 2026-08-26 (#88)                     | 2026-09-04 (#152)                               |

## What an indicator has to do here

Churn on its own says nothing. A core that grows a feature a week and a core
that cannot hold its shape both show the same line count moving, and the
presenter has spent the last week growing features a user asked for — a masked
scrim, overlapping holes, a halo, a fixed target, scrolling a target into view,
a glide of Leko's own. Counting the lines would call all of that instability.

So an indicator here has to answer one of four questions, and the fifth family
is about the writing rather than the code.

1. **Settledness.** Has it stopped moving — measured from when it was extracted,
   not from the beginning of the repository.
2. **Grip.** How much of its own package the pure core actually governs. A plan
   that decides less of what happens is less protected by being pure.
3. **Staleness surface.** How many identities a late report has to be told
   apart by, how many effects come back into `reduce` from inside the shell,
   and whether what keeps that safe is a type or a rule. This is the thing
   that makes a state core hard, and all three of it are countable.
4. **What the search can see.** Invariants, witnesses, mutants caught, and
   whether anything has ever proved rather than sampled.
5. **Drift.** What a README says about the model beside it that nothing
   reads back — a count, or a list the model already holds.

Deliberately not indicators: total line count, cumulative churn, test count.
The first two grow with capability and the third grows with paranoia; none of
them moves when something goes wrong.

## The reading, 2026-09-05

|                                                     | the machine              | the presenter                |
| --------------------------------------------------- | ------------------------ | ---------------------------- |
| **Settledness**                                     |                          |                              |
| Last change to the pure core                        | 2026-08-31               | 2026-09-05                   |
| Commits from extraction to the last change          | 16, over 5 days          | 3, over 1 day so far         |
| Breaking commits since extraction                   | 8                        | 0                            |
| Share of those commits that were `fix:`             | about a tenth            | about a seventh              |
| **Grip**                                            |                          |                              |
| Share of the pair that is shell                     | 35%                      | 63%                          |
| Branches in the shell                               | 5                        | 40                           |
| Decisions the shell makes that the plan does not    | 1                        | 3                            |
| **Staleness surface**                               |                          |                              |
| Identities a late report is told apart by           | 1 (`Position`)           | 3 (step, `Pending`, `Glide`) |
| Page facts the plan reads as event data             | 1                        | 3                            |
| Effects that dispatch back into `reduce`            | 5                        | 3                            |
| How re-entry is made safe                           | identity guards          | effect order                 |
| **What the search can see**                         |                          |                              |
| Invariants                                          | 2                        | 7                            |
| Witnesses                                           | 14                       | 39                           |
| Branches of `reduce` with no witness                | not per-branch           | 1                            |
| Traces in the corpus                                | 12                       | 18                           |
| Model mutants caught                                | —                        | 5 of 6                       |
| Code mutants caught by the hand-written suite alone | 3 of 7                   | 10 of 12                     |
| Code mutants caught by a replayed trace alone       | 7 of 7                   | 10 of 12                     |
| Code mutants caught by the two together             | 7 of 7                   | 12 of 12                     |
| `quint verify` ever run                             | the wide search, 8 steps | **never**                    |

The machine's witnesses are not one per branch — they aim at states the model
was written to reach, and `scripts/model-check.mjs` fails on a zero either way.
The presenter's are one per branch of `reduce` a trace can reach, which is what
makes the missing one countable.

## Settledness: the reading is "too early to tell", and the calendar will say

The machine's pure core has not been touched since 2026-08-31 (#123). What has
moved since went to `machine.ts` and the seam in `types.ts` rather than to the
plan. Sixteen commits ran between the extraction and the last of them, eight of
them breaking, and then it stopped. That is a core that found its shape.

The presenter's pure core is **one day old**. It was extracted on 2026-09-04 by
#152, modelled the same day by #153, and corrected on 2026-09-05 by #157, which
gave `retrying` an `unmeasured` field so that the one wait a resolve cannot end
is given up rather than re-armed for ever.

So the honest reading of the presenter's settledness is that it does not have
one yet. What has moved is the extraction itself plus the glide that landed the
day before it — the work of giving the presenter a state core, not the work of
failing to keep one. Nothing in it has broken compatibility since it existed.

**The machine's own history is the yardstick.** It took sixteen commits and five
days from extraction to quiet. If the presenter's plan is still taking breaking
changes on 2026-09-14, that is a finding. Before then, the churn is
indistinguishable from the churn the machine had at the same age, and the
indicator to read instead is grip.

The one thing settledness already says: the churn is **growth, not correction**.
About a seventh of the commits touching the presenter's pair are `fix:`, against
about a tenth of the machine's — the same order, on a core that has had a
fraction of the time to accumulate the safe ones. The rate at which the
presenter has to be corrected is not the finding; it is simply doing more.

## Grip: this is where the two differ, and it is not the plan's fault

The machine's shell is a third of its pair and holds five branches. Its effect
`switch` makes calls and nothing else, except in one place: `draw` resolves the
anchor and answers `lost` where there is none. That is the one decision in
`machine.ts`, and `plan.ts` argues it — pulling it apart would mean an anchor
travelling back through the plan, and an anchor is resolved, used and dropped.

The presenter's shell is nearly two-thirds of its pair and holds forty branches.
Its effect `switch` is as clean as the machine's — one line per effect — so the
branches are in the DOM helpers below it, and most are
plumbing: measuring, stacking layers, choosing which edge a message anchors to,
null-guarding a node. Three are decisions:

- **`arrive` decides whether the page glides**, from `anchor && this.scrolls(step)`.
  Argued in its doc, and the argument holds: a scroll has to start from where
  the target is and only the shell can ask. What it answered goes back in as
  event data.
- **`replace` re-resolves the target and picks between two shapes of redraw** —
  resize the standing layers and place the way out, or measure and set and
  perhaps say. The plan's `resized` case says "put the holes back"; which of
  those two putting them back means is decided in `presenter.ts`. The `Effect`
  type carries `saying` precisely so this is one effect rather than two, and the
  doc on `replace` argues it, but the branch is a decision and it is in the
  shell.
- **`reveal` decides that a draw found nothing to measure** and reports
  `unmeasured`. That one is a report of a page fact and reads as plumbing.

Grip is the indicator to watch while settledness is unreadable, because it is the
one that says how much the extraction bought. The machine's plan governs its
package. The presenter's plan governs the mode, and `presenter.ts` still holds
one decision the plan cannot see. Every future disagreement between the model
and the browser will be in that gap.

## Staleness surface: three identities against one

The machine tells a late callback apart by one thing. `Position` is an object
replaced on every move and on nothing else, so its identity **is** the step
occurrence, and `stillAt` is asked at every branch a late report can reach. One
identity, one question, one helper. `lost` is the one guard that compares the
step rather than the position, because a watcher still armed on the step before
has to be told from one reporting this step — and that is a second question
about the same identity, not a second identity.

The presenter has three, and they are not interchangeable:

| told apart by   | on which event                     | why it is not the others                                              |
| --------------- | ---------------------------------- | --------------------------------------------------------------------- |
| the step object | `morphed`, `mutated`, `unmeasured` | a batch or a morph landing about the step before                      |
| `Pending`       | `expired`                          | a deadline set for a wait that has ended                              |
| `Glide`         | `settled`                          | a reason told mid-glide replaced the record and left the wait running |

Three is the honest cost of a core that has two kinds of wait in it. It is not
excess: the model README records a mutant that no trace caught until the oracle
compared *which* glide the mode holds rather than how many were running, and in
a browser that mutant is a hang. But three identities is three times the surface
on which a stale report can be mishandled, and it is why the presenter carries
seven invariants where the machine carries two.

Both cores re-enter their own `reduce` from inside the shell, and **they are
made safe in different ways.** That difference is worth an indicator of its
own, because one of the two is checkable by construction and the other is not.

The machine has five effects that dispatch back in — `draw` can answer `lost`,
`validate` answers `validated` or `refused`, `chain` answers `chained`, and
either `onEnter` can answer `entryFailed`. It tolerates all of it. The
ordinary continuation is **declared in the plan** as `Outcome.next`, which the
shell dispatches after every effect has run, and anything that landed early is
caught by the `stillAt` asks. A late report cannot do damage because every
event that can land late carries the position it was planned at.

The presenter has three — `reveal` reports `unmeasured` or `morphed` from
inside itself, `arrive` is a `show`, `lost` is a teardown from inside the
machine's call — and it has no `next`. Its safety is a rule about **the order
of a list**: a re-entrant effect is the last of its outcome, because anything
after one would run against a mode a nested dispatch has already replaced.
Nothing in the type says so. `plan.test.ts` asserts it on every outcome the
suite sees, `reentrantIsLast` asserts it on every outcome any trace reaches,
and the model unrolls its interpreter three deep to get there.

A rule enforced by an invariant is weaker than one enforced by a type, and
this is the presenter's, held by a test and an invariant rather than by the
compiler. It is the last item on the list below.

**This is the structural difference between the two cores, and unlike churn it
will not go away with time.** The presenter's state core is harder than the
machine's, permanently, and the right response is the one already taken: more
invariants, more witnesses, a corpus half again as large.

## What the search can see

Both models run in CI under `pnpm model`, both have their invariants and
witnesses read out of the model rather than listed in the script, and both have
a corpus replayed against the real `reduce`. On the parts that can be compared,
the presenter's model is the better instrumented of the two: seven invariants to
two, thirty-nine witnesses to fourteen, eighteen traces to twelve.

Three gaps are worth naming.

- **`quint verify` has never been run against `plan.qnt`.** The machine's model
  has been proved rather than sampled to a depth of eight, and the command is in
  its README — but only for the wide search. `initRunning`/`stepInside`, the
  second search `model-check.mjs` runs precisely because the wide one hardly
  reaches a third step, has never been through Apalache either; its README says
  so under **What this does not cover**. The presenter's has no proof at any
  depth. This is the largest single gap in the reading, and it is one command
  away.
- **One branch of the presenter's `reduce` has no witness.** The stale guard on
  `unmeasured` is exercised by nothing, here or anywhere, because `unmeasured`
  only ever arrives from inside the `reveal` that just committed the mode it is
  checked against. The README says so and keeps the guard. Two more guards are
  in the same position — the stale `morphed`, and the `disarm` before `lost` —
  and each was confirmed unreachable by asking the model directly. **Three
  pieces of dead defence is a fact worth re-asking whenever the plan changes**,
  because a guard the model says cannot fire is either free insurance or a sign
  the plan is defending against a shape it no longer has.
- **The machine's hand-written suite catches 3 of 7 mutants alone; the
  presenter's catches 10 of 12.** Read that the way each README reads it: the
  machine's number is low because its corpus went looking for states nobody had
  thought of and found four. Three of the four have named tests now, in the
  `what the tour says it is doing` group. The fourth — a second teardown opened
  while one is already running — is still held by `stop-tearing` alone: the
  nearest hand-written test calls `stop()` twice in a row, and the first leaves
  the tour idle, so it never reaches the re-entrant case. The presenter's number
  is high because its plan is younger than its model, so the examples were
  written knowing what the search would ask.

## Drift: what the model READMEs say about themselves, and are not

Both model READMEs state things about the model beside them that nothing reads
back, and five of those are wrong. This is the indicator with the shortest path
to a fix and it applies to both cores equally.

| where                                                             | says                            | is                       |
| ----------------------------------------------------------------- | ------------------------------- | ------------------------ |
| `packages/machine/model/README.md`, **The corpus**                | `traces/` holds 11 traces       | 12                       |
| `packages/machine/model/README.md`, opening                       | `machine.test.ts` is 1943 lines | 1778                     |
| `packages/presenter/model/README.md`, **What the corpus found**   | twenty edits to `plan.ts`       | twenty-two               |
| `packages/presenter/model/README.md`, **What the corpus found**   | these are the other ten         | twelve, in the table     |
| `packages/presenter/model/README.md`, **When `pnpm model` fails** | six invariants, in a command    | the model declares seven |

The last one is not a count and is the one to fix first. That heading gives the
`quint run` line to reproduce a CI failure with, and it names the invariants
one at a time: `worldIsFixed` is not among them. Somebody reproducing a failure
from it runs a search that cannot break the invariant they may have broken, and
is told there is nothing there. It is a hand-kept copy of a list the model
already holds — the exact thing `scripts/model-check.mjs` exists to refuse, and
it is #166.

The repository already knows the cure. `scripts/model-check.mjs` reads the
invariants and the witnesses out of each model rather than keeping a list,
because "a `val` added to one and not the other would be neither checked nor
alarmed on". A count typed into prose is that same second copy, and so is a
`--invariants` line typed out by hand. The same argument that killed line
numbers in prose applies: nothing checks it, nothing updates it, and it goes
stale the first time somebody adds a trace.

## What this reading says

**The story-step core is settled, and the reading agrees with the feeling.**
Quiet since 2026-08-31, no breaking change since, one decision in the shell and
one identity to compare. Its weakest number is `quint verify` at eight steps and
no further, and on only one of its two searches; after that, its hand-written
suite leaning on the corpus for half of what it catches.

**The animation core is not unhealthy — it is one day old.** Its churn is
growth, at the same correction rate as the machine's, and it arrived with more
invariants, more witnesses and a larger corpus than the machine has. Judging it
by settledness now is judging it at an age where the machine had no reading
either.

The two indicators that say something today are grip and staleness surface, and
they name two things. Grip points at `presenter.ts` — nearly two-thirds of the
pair, forty branches, and a `replace` that decides in the shell what putting the
holes back means. That is where the model and the browser will disagree, because
it is the part no model watches. Staleness surface points at
`Outcome` — three identities and three re-entrant effects, kept safe by a rule
about the order of a list that nothing but a test and an invariant enforces.

So the order of work the reading suggests:

1. Stop `packages/presenter/model/README.md` naming its invariants by hand — #166.
   A `--invariants` line typed into prose is a second copy of a list the model
   holds, and this one is already missing `worldIsFixed`, so a failure
   reproduced from it is told there is nothing there.
2. Run `quint verify` against `plan.qnt`, and against `initRunning`/`stepInside`
   while the Java is installed. One command each, and it closes the largest gap
   in the table.
3. Fix the four counts, and stop writing counts that nothing checks.
4. Leave settledness alone until 2026-09-14, then take it again. Sixteen
   commits and five days is what the machine needed; a presenter still taking
   breaking changes past that is a finding.
5. Take `replace`'s decision into the plan, or write down why it cannot go —
   #164. It is the one place where the presenter's split is weaker than the
   machine's, and the only entry in the grip column that is not plumbing.
6. Make the presenter's ordering rule a type rather than an invariant — #161.
   An `Outcome` that carries its re-entrant effect in a field of its own, the
   way the machine's carries `next`, would make the rule unbreakable instead of
   merely checked. Last because the presenter's plan is one day old and the
   shape may still move on its own.

Two more came out of reading the code for this reading rather than out of the
table, and neither is about state:

- **#162** — a resize measures the same holes twice in the same task, because
  `cutouts` resolves the step's regions as well as measuring them.
- **#163** — the glide is a large part of `scrim.ts` that the `Scrim` class
  references none of.

Of the six, 1, 5 and 6 have issues. Two, three and four live here and nowhere
else, and the two cheapest on the list are among them.

## Retaking the reading

```bash
# settledness: every commit to each pure core, in order, with the breaking ones
# marked by their own subject line. The extraction is the last entry.
git log --format="%ad %s" --date=short -- packages/machine/src/plan.ts
git log --follow --format="%ad %s" --date=short -- packages/presenter/src/plan.ts

# settledness: the share of each pair's commits that were corrections. The
# presenter's pair moved out of `packages/leko` in #185, and `--follow` takes one
# path, so this counts from the move; the `git log --follow` above has the rest.
rate() { local all fix
  all=$(git log --format=%s -- "${@}" | wc -l)
  fix=$(git log --format=%s -- "${@}" | grep -c '^fix')
  printf '%d of %d\n' "$fix" "$all"; }
rate packages/machine/src/plan.ts packages/machine/src/machine.ts
rate packages/presenter/src/plan.ts packages/presenter/src/presenter.ts

# grip: the share of each pair that is shell
share() { local pure shell
  pure=$(grep -vcE '^\s*(//|\*|/\*|$)' "$1")
  shell=$(grep -vcE '^\s*(//|\*|/\*|$)' "$2")
  printf '%d%%\n' $(( (shell * 200 / (pure + shell) + 1) / 2 )); }
share packages/machine/src/plan.ts packages/machine/src/machine.ts
share packages/presenter/src/plan.ts packages/presenter/src/presenter.ts

# grip: branches in the shell
grep -cE '\bif \(|\? ' packages/machine/src/machine.ts packages/presenter/src/presenter.ts

# what the search can see: invariants and witnesses, read the way CI reads them
pnpm model

# drift: what is on disk, against what the READMEs say about themselves
ls packages/machine/model/traces | wc -l
ls packages/presenter/model/traces | wc -l
wc -l packages/machine/src/machine.test.ts
grep -A2 -- '--invariants' packages/presenter/model/README.md
```

Five rows are read rather than counted, and a command cannot take them:
**decisions the shell makes that the plan does not**, **identities a late report
is told apart by**, **page facts the plan reads as event data**, **effects that
dispatch back into `reduce`** and **how re-entry is made safe**. Each is argued
in the section under it, and each is small enough that the argument is the
check. `quint verify` is the sixth: whether it has been run is a fact about a
README, not about the tree.

The mutation rows are not a command. Each is an edit made on purpose and run
past one suite at a time, and both model READMEs record their own under **What
it found** and **What the corpus found, and what it did not**. Retaking those
means doing the exercise again, and the rows to retake are the ones whose
subject has changed since.
