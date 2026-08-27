# Leko's design

Leko highlights an element by cutting a hole in an overlay, so the user can
interact with the real element underneath.

That is the core of it. A tour needs more than the hole, though. It has to keep
track of where it is, and it has to work with the application around it.

State that accounts for async work is where the bugs live. So the value here is
not only the spotlight. Getting the state logic good enough to trust matters
just as much.

This file holds the rules. Where a rule exists because of what a browser does,
it names the page under [`spike/`](spike/) that settled it. **Open that page
before overruling the rule.** Situations a tour meets are cases under
[`examples/sandbox/src/cases/`](examples/sandbox/src/cases/), named below by
file. How the code got here is in the commits.

## Two constraints that must not be broken

These are why Leko exists. Everything else is negotiable. These are not.

**1. Never place an element over the target.** The highlight is a real hole,
cut by an even-odd `clip-path`. Layer anything over the target, transparent or
not, and pointer events and focus stop reaching the element underneath. The
library loses its purpose at that moment.

**2. Steps advance on application state, never on DOM events.** The host
reports what happened. It calls `leko.reached('order-saved')` when it knows the
thing happened, after its API call resolved, after its own validation passed.

## Signals and steps

A call site names the event. It never names a step. "Advance whatever is
showing" would force the call site to know where in the tour it sits, so that
inserting a step makes an existing call fire at the wrong moment. There is no
such call. The step declares what it waits for, and the two are matched.

```ts
{ id: 'save', target: 'button[type=submit]', awaits: 'order-saved' }
```

Three properties follow. All three are the point rather than side effects.

- **A signal nobody waits for does nothing.** No error, and no warning on every
  unrelated call. Instrumentation is meant to stay in the source permanently,
  including in builds where no tour ever runs. Something that must be free to
  leave in cannot complain about being left in.
- **A signal is not buffered.** Reporting a name before the story reaches the
  step that awaits it does nothing, and arriving there later does not consume
  the earlier report. A step advanced by something that happened before it was
  on screen has established nothing about the user.
- **It is a no-op while nothing runs**, so callers never write a guard.

**The only thing that advances a step without naming a signal is the next
control Leko draws, and nothing else can reach it.** Which steps have a control
is derived from `awaits`, and that derivation says nothing at all unless the
presser is the same thing that decides whether there is a control. A public
"advance" would stand outside it: a host puts its own button in its own chrome,
beside a step waiting for `order-saved`, and the user is past the work that step
exists to make them do. An application reporting its own state uses
`reached()`.

The signal is matched against the story running, and only that one. A call site
reports once, however many stories pass through that screen. See
`two-stories.ts`.

## The next control

A step that declares no `awaits` gets a next control on its message. A step that
declares one never does. Put a button beside the instruction on a step waiting
for `order-saved` and the user can press past the work that step exists to make
them do. One button defeats the second constraint.

**Which steps have a control is derived from `awaits`, and a story cannot
configure it.** `LekoOptions.nextLabel` only says what the control reads.

**And pressing it is the only way anything advances a step without naming a
signal.** The derivation above is worth nothing on its own: a second mover, in
public or reachable from `renderClose`, is a control on a step that was never
given one. So the presser is the thing that decides whether there is a control,
`Host.next` is how it says so, and no method sits beside it.

Without a control, two actions have to share one step. "Type 3, then place the
order." The interface got coarser because the application had nothing to report.
Everything reaching the control inside one frame is the same press. See
`next-control.ts`.

## The way out

The scrim blocks the page with rectangles. A host's own "skip the tour" button
is under one of them unless that host thought about it, so a project that never
thought about it has built a trap, and the trap is what it got for free.

**So Leko draws a control that ends the tour, it is on screen for as long as the
tour is drawn, and there is no way to turn it off.** There was one. It was a
host saying it had its own way out and would rather Leko stayed off the
corners — and that host cannot put its own control anywhere safe, because
staying off the cutouts needs geometry only Leko has. An option to take the
control away was an option to build a page somebody cannot leave, which is the
trap this whole control exists to close. What a host may change is what the
control says and what it is made of, never whether it is there.

**It is the only control Leko draws outside the message.** There is no back
control, and a next control belongs to a step and is derived from `awaits`.
Ending is the one call the gate below never refuses, so it is the one thing
worth putting on the page unconditionally. A control that sometimes did nothing
would be worse than no control.

**This is not the next control's rule again.** A step that declares `awaits` has
no next control, because a button beside the instruction is a way past the work
that step exists to make somebody do. Ending the tour is not a way past the
work. So `awaits` decides one and says nothing about the other.

**It goes in a corner no cutout covers.** Top right first, because that is where
a control that ends something is looked for. A target in that corner is an
account menu or a notification bell, which is not rare, and a box left on top of
one takes back the interaction the hole exists to allow. `freeCorner` is the
same job `chooseSide` does for the message, one size down: four candidates and
an answer that is always one of them. Where every corner is covered the least
covered one wins, because something still has to be pressable.

**Leko owns where it goes and a host may own what is in it.** `renderClose` is
handed a positioned root and `stop`, and hands back its own teardown. It is not
given the instance: the only thing this control may do is end the tour, and
anything reachable from here that advanced a step would be a second next control
standing outside the step that decides whether there is one.

## A target is a question

A step says what it points at with a selector or with a function, and **both are
a question rather than an answer**. Leko asks again every time it needs the box:
at the step boundary, when the viewport changes, and on every mutation while a
target that went missing is being looked for. It never holds an element.

This is the same rule as `step.message` being read on every draw rather than
copied when the story was written. An element written into a story is a
lookup somebody did earlier, and the page has moved on since — a framework
swapping a node for an identical one is the ordinary case, not the exotic one.
So there is no element form of `LekoTarget`. `() => el` says the same thing for
a host that really does mean one node and no other, and the shape of it is the
shape that invites `() => ref.current` instead.

The two forms differ in who answers. A selector is a question Leko runs, which
is the short way to say it and the way most steps should. A function is one the
host runs, and it is the only form for a target a selector cannot name: inside a
shadow root, where `document.querySelector` does not reach; a framework ref,
where there is no stable class or attribute to match; a row picked out of a list
by something only the application knows. See `inside-shadow-dom.ts`.

**`target` is a list, and each element of it is one cutout.** An element written
as a list of its own is unioned into a single hole, so
`target: [['#label', '#input']]` lights the pair and the gap between them, and
`target: ['#save', '#total']` cuts two holes with the page still dimmed between.
One rule, and both readings are in the source where somebody can see them.

Two properties would be the other shape: one that unions whatever it is given,
and one beside it that cuts a hole per element. Neither name can say which merge
it does, so a reader has to learn the pair, and the pair is the only place the
difference is written down. The list writes it in the source instead. Nesting is
the union, and the top level is the cutouts.

**The first region is the one the step is about.** Its first element is what
`validate` is handed and what the message anchors beside. It is also the one the
search for a lost target is about. Later regions are looked at rather than acted
on: a summary beside the row it was computed from, and `linked-regions.ts` is
that case. One that resolves to nothing is a hole this step does not cut, and
nothing else follows from it.

`adjacent-columns.ts` is the union, and it says why two corners are enough. Two
regions never union, because the bounding box of two distant ones covers
everything between them and hands the user a hole the size of the page.

**A function must be cheap and must not do anything.** It is called far more
often than once, and it is called during layout work. It may answer `null`,
which is not a failure: a target that is not there yet is what the search for a
lost target is for, and `null` is how a host says so.

**The message anchors to a marker of Leko's own, never to the target.** A
zero-area element, put on the chosen edge of the cutout, living beside the scrim
in the same container. Two things fall out of that and both matter.

An `anchor-name` is scoped to the tree the element is in. Name the target and a
target inside a shadow root cannot be reached from the document at all, and
nothing reports it: the box lays out as though it had no anchor and lands
wherever its containing block leaves it, which is sometimes on top of the
target. See `spike/anchor-across-shadow/`. The marker is Leko's own element in
Leko's own tree, so the question never arises and every target is anchored the
same way.

**And Leko writes nothing into the page it is pointing at.** Naming the target
meant putting `anchor-name` into somebody else's inline style and putting back
whatever was there, which is a promise that holds until one path out forgets to
keep it. There is no such promise now.

The marker follows a scroll for the same reason the scrim does, and it is the
same reason: the container carries both, and no script runs. It goes on the edge
rather than in the middle because it has no area — `position-area` lays the box
out from that point alone, and a point in the middle of the hole would put the
message over half of it.

## A failed attempt

**`validate` guards the control, and only the control.** Pressing it claims the
moment has come and claims nothing about the state behind it, so a step with a
control can want a guard. A step that declares `awaits` has neither. The
application already said the thing happened, and reading the page to check is a
second source of truth for the same question. The second kind is what the second
constraint exists to keep out, and one rule derived from `awaits` is easier to
hold than two.

**A refusal is never silent.** The cutout shakes on every no. Which half of a
refusal happens is read off the step and is not a choice anything makes at the
time.

There was a version where both halves were handed to a handler as `shake()` and
`setError()`. A step could then declare `validate` and no handler, and pressing
Next on that step did nothing at all. One of the three guarded steps in
`examples/sandbox/src/cases/` was written that way. That is the same button the
way out exists to keep off the page, one control along, so the shake is now
derived and `error` is the only part a step decides.

**`error` puts the reason under the instruction. It does not replace it.**
A user who has just been told they were wrong needs to still read what they were
asked for. Nothing takes the reason away again. It goes when the next attempt
succeeds or the step changes, because those are the two moments it stopped being
true. A `clearError()` would only invent a way to leave a stale complaint on
screen. A step with no `error` still refuses, in silence.

**`error` is asked once, for the attempt that failed.** `target` is asked every
time anything needs the box, and `message` is read every time the step draws, so
an edit to either is seen. This one is different. The function form runs in the
turn the guard said no, on the element the guard was handed, and the words it
gives back are held from there. Asking again on a redraw would let a reason
change while nobody had tried anything.

**There is no hook for a failed press.** `onValidationError` was one, and
because it returned `void` a handler could keep its utils and answer two steps
later. Those answers were dropped. So the freedom on offer was the freedom to
write code that did nothing, and it cost an anchor travelling into `plan.ts` and
back on two events of its own, plus a set in the model holding every answer
still owed. A reason that has to be fetched belongs to a different shape: the
application finds out, then calls `reached()`.

Leko does not hold the instruction. `step.message` is read every time it draws,
and `StepBase.message` is `readonly` to say so.

## Starting a story

`start(story)` is handed the story itself, and it is the only way a host puts
one up. The other way is a story naming the one that follows it, further down
this section.

**`start` never ends a tour.** A call made while one is running is turned down
and reported as `tour-running`, naming both the story it was given and the one
it left alone. `stop()` is the way out and it is the only one, which is what
lets a host read this call as one that either puts a story up or does nothing at
all. Moving between tours is two calls.

That is a rule about the API rather than about the machine. It removes no
branch. `plan.ts` is a line longer for it. What it removes is a second way for a
tour to end, in a library whose whole **The way out** section is an argument
that there should be exactly one.

**A component that starts its story on every render is turned down rather than
restarted.** Before, it got a tour that went back to step 1 whenever anything
above it re-rendered, and the `id` was not read so a fresh object was a fresh
run. That was a bug the developer could see, and it is now a bug the developer
is told about. The two refusals are separate members of `LekoProblem` because
the fixes differ: a `call-refused` is worth making again a moment later, and a
`tour-running` will be turned down every time until the tour ends.

What a host loses is one call where it now writes two. `stop()` runs the whole
teardown inside the call that made it, so the `start` on the next line goes
through. What it pays is an extra ending report, and `onLeave` being told the
tour is going nowhere rather than being handed the story that follows. Both of
those are true: the tour really did end.

**There is no registry.** A host already holds its stories — they are objects it
wrote — and a map from a name to one of them would be Leko holding a second
copy of something the application is better placed to keep. It would also make
`start` two operations, a lookup and a run, with a failure of its own for the
lookup: a name nothing answers to. Handing the object over deletes that failure
rather than reporting it, because the compiler will not let a name that does not
exist be written down in the first place.

What a host loses is starting a story it has no reference to. That was worth
paying for. A story a screen can start is a story that screen can import, and
where it genuinely cannot — a branch decided in one module and defined in
another — the answer is the same import, or the handler that already knows both.
`branching.ts` is four stories in one file for exactly that reason.

**`id` is still required, and Leko still never reads it.** It is the name a
story goes by outside Leko: in a diagnostic, in whatever `onStep` reports to,
in a log. `LekoStep.id` has been that and nothing else from the beginning, and
the two are now the same thing. Nothing enforces that two stories differ in it,
the same way nothing enforces it of two steps, because nothing in here is
keyed by it.

**The story the tour is on starts again.** There is one meaning to this call and
it is "put this up": the run standing there ends, reports its ending, and a new
one begins at the first step of the object just handed over. A component that
rebuilds its story on every render and starts it on every render gets a tour
that restarts, which is a bug it can see. What it never gets is steps changing
underneath a position somebody is standing on, which is a bug nobody can see.

**A story says what follows it, and `start()` is still the only way one is put
up from outside.** `next` names the story the tour goes on to when this one runs
out of steps. Four short chapters that always run in order are four `next`
declarations, and the application never has to notice that a chapter ended.

**Only a story that ran to the end is followed.** A `stop()`, a target that
never came back and a handler that threw all end the tour where it stands.
Somebody who pressed the way out is not carried into the next chapter. That is
also what took a question out of `branching.ts`: the rejoin used to live in
`onStep` and had to read the page to tell an ending it caused from an ending
somebody else did.

**Nothing about `next` is stored.** The function form is asked when the last
step advances and the answer is used there and then. Run the same story again
and it is asked again. A field the machine wrote at the end of one run would be
read at the end of the next, and a tour inheriting an earlier tour's branch is a
bug that only shows up on the second run.

```ts
next: summary
next: () => (order.needsReview ? review : summary)
```

The second form is where a branch goes. What it reads is the application's own
state, which is what `awaits` and `reached()` already say a step advances on,
one layer up. `branching.ts` is four stories joined this way, and its two
buttons report `path-chosen` rather than starting anything.

**The join is one operation, and `onLeave` is told where the tour is going.**
The ending stays closed through its own report, so the story named in `next` is
the story that runs. A panel two chapters share can stay open across the join.
This is the only way an ending has somewhere to go.

## Saying where the tour got to

`LekoOptions.onStep` does not reopen the second constraint. That constraint is
about Leko **listening**. A click listener deciding a step succeeded is
guessing. A hook reporting where the story is decides nothing, and it is the
only way anything can draw its own progress.

The line to hold is that nothing handed back may come back in. **The return
value is never read.** Something that could block a transition would be
`validate` again, in a place where the application has claimed nothing.

**There is one hook, it lives on the instance, and it is told which story
moved.** A story used to carry one as well and both fired, story first. The
story's could say nothing the instance's cannot: it was never told which story
it was, so anything spanning two of them was written on the instance anyway,
and a readout that lived on the story stopped reporting for anything that
spanned two of them. What it cost was an ordering promise that had to hold on
every path out of the machine. A handler that cares about one story compares it
— the object it gets is the object it started — and one that only wants to log
asks `story.id`. A host whose stories live in several modules writes one handler
and routes it, which is what `main.ts` in the sandbox does.

`stop()` reports the ending with no step, and so does running past the last one.
A hook that could not say "nowhere" would leave a progress readout showing the
final step for ever.

**A handler may start a story from an ending that has nowhere to go.** `stop()`
and a tour running out of steps with no `next` report with the machine already
idle, and nothing runs after that report, so the story a handler starts there is
the story that runs.

**An ending with somewhere to go is not that kind.** A story handing the tour on
through `next` is one operation with the report in the middle of it. A story
begun from there would be overwritten by the one already on its way. So it is
refused, like every other call made while Leko is inside the application. That
refusal is what makes the `next` argument to `onLeave` worth having: the story
`onLeave` is told about is the story that runs.

**`start()` returns nothing, and `reached()` says nothing. Those are two
different silences.** A `reached()` call is instrumentation, and most of the
time no step waits for it, so answering would put a warning on every unrelated
call. `start()` is the host giving an order, and an order that came to nothing
is reported: `story-empty`, `tour-running`, `call-refused`. A call meant as an
order is answered, and one that is a report about the world is left alone. That
is the asymmetry `awaits` and `reached()` already have, one layer down.

**A return value cannot carry that answer honestly.** A story whose `onEnter`
throws synchronously ends the run inside the `start()` call, so the position is
empty by the time the call returns. The same story written `async` has already
put the position up, and the run ends a turn later. One failure and two answers,
decided by how a handler happened to be written. That failure is also the one
way out with no `Problem` of its own, and what a host gets there is the reason
thrown again, which **What a step and a story assume** argues for.

**`onStep` names the step and the story, and nothing else.** It named where the
tour came from as well, off a field the machine kept for it. A host that wants
the pair keeps the last `step` it was handed, and that line is right by
construction: the hook only ever names a step that went up, so a step whose
`onEnter` is still in flight cannot get into it. The machine was doing work to
hand back something a host gets for free.

`index` is there so a host never searches `story.steps`. A step is a plain
object with no identity of its own, and a story holding the same one twice makes
`indexOf` return the first of them.

**A lost target is given two seconds to come back, and then the tour stops.**
No hook decides otherwise. The target is *resolved again* rather than the old
element re-checked, because a framework replacing a node with an identical one
disconnects the old one, and `isConnected` on a replaced node is false for ever.
A correct application loses its anchor every time it renders over the step, and
ending the tour there would be punishing it for working normally.

The search rides the `MutationObserver` that noticed the loss, so it costs no
polling, and the curtain is down while it runs: a hole standing over nothing for
two seconds is the state the wait exists to avoid showing anybody. It covers a
target missing when the step arrives as well as one lost after it was drawn,
because a user cannot tell those apart.

**A replacement that arrives with the removal is not a wait at all.** A
framework swaps the node in one batch of mutations, and an observer armed after
that batch hears nothing about what is already in it. So the selector is run the
moment the loss is noticed, and a re-render over the step costs a morph. The two
seconds are for a target that is not back yet.

**A `target` given as an element cannot be recovered**, since there is no
selector to run again. That is the first real reason to prefer a string. The
ending is reported as `target-lost` through `onDiagnostic`. See
`target-disappears.ts`.

## What a step and a story assume

A step usually assumes something. A record exists, a panel is open. The story
around it assumes the same kind of thing one level out, and assumes it for
longer.

**The story's `onLeave` is the half that cannot be written anywhere else.** It
runs when the run ends, after the last step's, and a story handing the tour on
through `next` tells it where that is. Put a story's clear-up on the first
step's `onLeave` and it fires the moment the tour reaches step 2, with the rest
of the story still standing on what it took away. No step's leaving means the
story is over.

`onEnter` is that hook's partner. A drawer opened in `steps[0].onEnter` and
closed in `story.onLeave` is one pair split across two levels, and nobody should
have to read that. So `LekoStory` and `LekoStep` each have an `onEnter` and an
`onLeave`, and the story's runs first.

**`onEnter` runs first, and the target is resolved after it settles.** Resolve
first and the selector reads a page the step has not set up yet. That order is
the whole reason the hook is worth having.

**A tour goes in outermost first and comes out innermost first.**

```
story onEnter → step onEnter → resolve the target → draw → onStep
```

The ending mirrors it. The report goes last because a progress readout hearing
about a step while its `onEnter` still runs is naming something the user cannot
see. A handler that returns nothing costs no turn.

**Every `onEnter` gets its `onLeave`.** It runs where the handler failed
halfway, and where a `stop()` walked out of it, because a handler that set
something up before it fell over is owed one. `onLeave` is given where
the tour is going, since a panel that two steps use in turn is worth leaving
open. Starting another story counts as ending.

**A rejection stops the tour, and the reason is thrown again.** The state the
step assumes was never built, so drawing it would point the user at something
that is not ready. There is no hook for that failure. The rejection came from
the application's own code, and the place with the context to do something about
it is the handler that threw. See `step-setup.ts` and `story-setup.ts`.

## A story is atomic, and stories are short

**Leko offers no way back, and no way in other than the beginning.** There is no
`prevStep()`, and `start()` takes a story and nothing else.

A step that declares `awaits` cannot be returned to. Step 2 says "save the
order" and waits for `order-saved`. Somebody saves it, the tour moves on, and a
back button puts them on step 2 again, waiting for `order-saved` against an
order that is already saved. Nothing will report it a second time. The tour
hangs and nothing says why, which is the failure `onDiagnostic` exists for,
arrived at by a road that carries no diagnostic because nothing was dropped.

Leko cannot fix that. Whether a signal can be reported twice is a fact about the
application and there is no way to ask. Refusing to go back onto a step that
declares `awaits` would work, and it would make a control that works on some
steps and not others, which is worse than no control. Application state does not
run backwards. `onLeave` and `onEnter` can close a panel again. They cannot
unsave an order.

The same argument closes the other end. A `start(id, at)` that put somebody on
step 4 would put them on a step whose signal has already been reported, or on
one whose `onEnter` assumes work the steps before it did. Both are the same
mistake seen from the front.

**So the answer to "I need to go back" and to "start me part way through" is a
shorter story.** Write several. A story of four steps costs a few seconds to run
again, and somebody who misread step 3 loses those seconds. A story of twenty
does not, and twenty is where a back button starts to feel necessary.

This is easier on the application as well. Plenty of applications cannot undo
the state a step left behind, and a tour that pretends otherwise puts bugs in
code that was never written for it.

**What two paths share is a story, not a step they both point at.**
`branching.ts` is four of them: an intro, two branches, and the summary both
branches name in `next`. Neither branch has to know how many steps came before
it.

Nothing in the API is needed to work this way. A project writes as many stories
as it has, and `start(story)` replays one from the top. What a project chooses
is how much to put in each one, and Leko's answer is: less than you were going
to.

## Settings, and where they are read from

`padding`, `radius`, `curtain` and `curtainLabel` are read from the step, then
from the instance. `duration` is read from the instance alone. Whichever it is,
the nearer one that says anything wins, and `??` does the reading rather than
`||`, so a step writing `false` beats an instance writing a number.

**A story carries none of them.** A tier there says one thing: this value for
every step of this story. A host says the same thing with a `.map()` over
`steps`, in code it already owns, and that version can vary a value inside the
story as well.

What such a tier costs is `story` travelling into the half that draws, and
nothing else in there wants one. No member of `Presenter` takes a story.
`StoryBase` in `packages/machine/src/types.ts` holds no settings either, so a
story tier is `packages/leko` alone putting its own data through a seam the
machine has no use for.

**Two windows have no step to ask, and the instance is the only tier they
have.** A story's own `onEnter` runs before any step has been entered. A search
for a target lost after its step was drawn is a wait that step's `onEnter`
finished with long ago. Both read the instance and nothing else, which is why
that tier stays.

## The curtain

An arrival is a window where Leko acts on nothing a host calls. The page used to
look exactly as it had a moment before: the hole still on the step the tour had
left, the message gone, and everything outside the hole still clickable. Three
things were wrong with that, and they are the same thing three times over.

Nothing said the gate was refusing calls. The hole pointed at a step the tour
had finished with, with nothing beside it to explain why. And `start()` on a
story with a slow `onEnter` drew nothing at all, so somebody pressed Start,
watched nothing happen, and pressed it again.

**So the scrim covers everything, with no hole in it, while an arrival is in
flight.** `complementRects` with no holes is one rectangle over the whole
surface, which makes the curtain the empty case of what the scrim does every day
rather than a second way of covering things. The control from **The way out** is
above it and reachable through it.

**`curtain` is declared, never called.** `true` puts it down at once, a number
is how long an arrival has to last first, and `false` is never. It reads step,
then instance, the way `padding` and `radius` do.

A handler cannot ask for it. Nothing is known inside `onEnter` that is not known
where the step is written, the runtime case is already covered by the delay, and
a call made from in there is a call made while the gate is closed.

**It is on by default, at 250ms.** The window is confusing in every project
rather than only the ones that noticed, and a developer who has not noticed is
the one who will not set a flag.

**A curtain that was seen stays for a minimum.** A threshold has a band just
above it, and a curtain up for 40ms reads as a fault rather than as waiting. The
minimum is measured from the frame the curtain was first painted in, so a step
that declares `curtain: true` and hands back nothing owes nothing: it was set
and replaced inside one task and no frame ever carried it.

**Its lifetime is one value.** `Curtain` in `packages/leko/src/curtain.ts` is
down, waiting, painting or up, and each state carries the handle it has running,
so which way to stop it is a question the compiler answers rather than one the
presenter remembers. What used to say this was four fields, three of them
handles, and any two of them set at once was a state with no name. The decisions
taken off it — whether the page is covered, what an arrival asks for, what a
lift still owes — are pure functions with a test of their own, and no browser
can get any of them wrong.

**Leko puts no words on it, and a step usually should.** Leko does not know what
an `onEnter` is doing, and a library that guesses at that is the guessing this
one exists to avoid. The step does know. That handler is written on the step, so
`curtainLabel` reads step, then instance, the way `curtain` does.

Nothing bounds an `onEnter`. A search that takes 15 seconds is waited out for 15
seconds, and a grey sheet held that long with nothing on it reads as a tour that
has broken. That is what the step-level words are for.

**The instance's are the foot of it, and they cover the curtain nobody
declared.** `curtain` is on by default at 250ms, so an arrival that turns out to
be slow draws one in a project that never asked for it. Nothing at that level
knows what is being waited for. The step that would have known said nothing. So
what belongs on the instance is the general wording a host would put on any wait
of its own.

The box docks, because there is no hole to sit beside.

**A search borrows none of it.** A target that goes missing after its step was
drawn puts up the same curtain, and by then that step's `onEnter` is long
finished. Those words are about a wait that is over, so the search reads the
instance instead.

**It narrows the race and does not close it.** A request already in flight comes
back inside the window whatever is on screen, and its signal is dropped. See
`signal-too-early.ts`, where the reply lands 400ms into a 900ms arrival. That is
what `onDiagnostic` reports and why it stays.

## One gate, and what it refuses

**Leko never acts on a call while it is inside a call into the application.**

An arrival is such a window. It runs from the moment a move begins until the
step has been handed to whatever draws it, and `onEnter` is inside it whether it
answers in the turn or hands back a promise that lands half a second later. A
teardown is another: `onLeave` is running and the run is half taken apart.

Inside either, `reached()` and `start()` both do nothing, and so does a press on
the next control. Nothing that step assumes has been built, its
target has not been looked for, and it has never been on screen, so there is no
step there to act on. The call is dropped where it stands rather than saved for
when the arrival lands, because a signal saved over is a step advancing on
something that happened before it began.

**`stop()` is the exception, and asks nothing.** A tour that cannot be turned
off until an `onEnter` somebody else wrote decides to settle is worse than any
race this keeps out, and a component unmounting mid-arrival has nowhere else to
go. Ending is also the one thing that needs nothing of the arrival. It throws
the arrival away rather than acting on it, and the handler landing afterwards
finds nothing standing where it left.

**A morph is not an arrival.** A step that is drawn and still moving has been
through the whole window and the user is looking at it, so every call goes
through. Dropping one there would be Leko deciding the user did not mean the
button they pressed.

What the gate buys is that no callback has to ask afterwards whether the world
moved while it ran. Where that question was written by hand at every crossing,
one of them was always about to be forgotten.

## Saying that a call did nothing

Three calls do nothing. One stays silent and two do not, and the line is
whether a caller doing everything right can end up there.

Silent: `reached()` with a name nothing waits for. Instrumentation is meant to
stay in the source permanently, including in builds where no tour ever runs, so
something that must be free to leave in cannot complain about being left in.
**It must never speak**, and nothing should be added here that makes it.

Reported through `onDiagnostic`: a `start()` given a story with no steps in it,
a `start()` made while a tour is running, and any call refused by the gate
above. There is no version of starting an empty story a working application
meant, and a call refused mid-arrival came from an application doing everything
right at a moment nothing could be done with it. None of them has any other
symptom. The tour does not move, and nothing anywhere says why.

**The two refused `start()` calls are separate members, and the fix is why.** A
`call-refused` is the gate, and the same call a moment later goes through. A
`tour-running` will be turned down every time until the tour ends, so the fix is
`stop()` rather than patience. A host reading one member for both would have to
read `state` to find out which it was holding, and `state` has moved on by
then.

A press the gate turns down is in neither list. Every other refusal is reported
because a host made a call and nothing happened; the control is a button Leko
takes off the screen for the whole of an arrival, so there is no caller to tell
and nothing for one to do about it.

**A `reached()` that matched and was dropped is reported**, and that is the
split worth holding on to. A name nobody waits for is normal. A name the step
showing declared, arriving while that step was still being built, means the step
now waits for something the application has already been through. `awaits` is
the same string on both sides and the vocabulary is gathered from the call sites
either way, so silence there is a step that hangs for no visible reason.

**Nothing is logged.** The core has no build-time environment to strip a
development branch with, so anything written to the console is written in
production too. `console.error` is collected by error trackers and fails test
suites that treat it as a failure, `console.warn` is quieter and still arrives
where the host did not ask for it. A step whose target never turns up is
reported here rather than logged, for the same reason: Leko does not know what
the host wants done about it.

## `state` is derived

`state` is derived rather than stored. Two fields each say one thing, and it is
read off them.

```ts
export const stateOf = <S, St>(core: Core<S, St>): MachineState => {
  if (core.position === undefined) return 'idle'
  return core.phase === 'ready' ? 'running' : 'transitioning'
}
```

`position` is where the tour is, and being idle is it being `undefined`. It
holds the story and the index together because they are one fact, and it is
replaced rather than edited on every move, so holding the object is holding the
step occurrence. `phase` is how far along the machine is with what it is doing,
and it is the same field the gate above reads.

**`transitioning` means the tour is between things, and a wait the presenter
started on its own counts.** A target missing when the step arrives goes through
`show`, which hands a promise back, so the machine hears about that one without
being told. A target lost after the step was drawn is noticed by the presenter
and nobody asked for the search, so it is reported through `Host.searching` and
the phase says `searching` while it runs. The two waits put the same curtain on
the same screen, and answering them differently would leave a host unable to
stand back for one of them. That is the reading `state` is about the machine and
not about the screen would have allowed, and the cost of it is a fifth member on
`Host`.

**`Host.searching` is said on the second of those and not on the first.** The
presenter used to say it on both, and on the first the phase it wrote was
overwritten by the `settling` the promise put on, in the same turn. A call whose
effect is undone before anything can read it is a call that reads as though it
does something. `unasked` in `DomPresenter.search` is which of the two waits
this is.

**A teardown says `idle`, and the gate is still shut.** `end` empties the
position before it calls anything, so a handler reading `state` from inside its
own `onLeave` is told the tour is over. That is the truth, and the ending
`onStep` is written on top of it: the report finds a machine a host may call
into. The phase underneath is still closed, which is what refuses a `start()`
made from in there.

**Nothing can forget to write an answer that nobody stores.** Before adding a
field here, check whether it is a third way of saying what two fields already
say.

**Everything the machine knows is one value.** Four fields in `plan.ts` as
`Core`: where the tour is, the phase, the words of the last failed attempt, and
the morph the presenter is running. The class holds one `#core` and one `commit`
that writes it, and every event is answered with the whole of the next `Core`
rather than with a field to set.

**None of the four is a list of stories.** `start` is handed the one it is to
run, so there is nothing to look up and nothing to keep between runs. The state
is what a tour is doing, and the stories a project happens to have written are
not that. `packages/machine/model/machine.qnt` has the same four.

**None of the four is there to be handed back.** A field the machine keeps only
so that a hook can read it is a field two places have to agree about. Where a
host can keep it and cannot get it wrong, the host keeps it.

**A move is written where it is decided.** `plan.ts` holds the shape, the
readings taken off it, and then one spread per case. Giving each of those a name
of its own bought a second vocabulary for the same set of transitions, so a
reader had to know that the `shown` event calls `settling()` and the `settled`
event calls `settled()`. One vocabulary is the event names.

**The machine is three files.** `types.ts` is what a host brings and what a
presenter owes. `plan.ts` is the state and what an event does to it, and it is
pure. `machine.ts` is the class, and it decides nothing. Anything a fourth file
would hold is one of those three.

**The three types a host brings are one parameter.** `W extends World` carries
the anchor, the step and the story, and every signature reaches through it with
`W['step']` and `W['story']`. Three parameters tied together by an F-bound cost
four lines of header on functions with fifteen-line bodies, and a host declares
its `World` once and never sees it again.

**The calls out are a value too.** `plan.ts` answers an event with the next
`Core` and a list of the calls the machine owes: hold, teardown, draw, the
handlers, the report. `machine.ts` commits the state and then makes them, in
that order and no other. Three of those calls are into the application, which is
free to call straight back in, and what such a call finds is the machine as the
event left it. That used to be a rule kept by hand at seven places, each with a
comment saying why the line above it came first.

An event stops where the machine hands control over. `end` is two of them,
because the curtain goes up between the last `onLeave` and the report where
nothing follows that report. There are eight such windows and an event apiece,
which is what keeps one reduction from spanning one.

**`dispatch` is re-entrant, and that is load-bearing.** A call made from inside
an effect runs down the stack rather than joining a queue.

The host does not ask for this. `plan.ts` hands back the event the machine owes
itself alongside the calls it owes the application, and `dispatch` runs that
event on the same stack. `ending` returns `left`, `left` returns `startInto`,
`moveOn` returns `entering`, `opening` returns `openStory`, and `stepEntered`
returns `drawn`. A press on the last step of a story that names what follows it
runs `pressed`, `chained`, `left`, `startInto` and `openStory` down one stack.
Re-entrancy is how the machine walks its own chain, and it would be here if no
application ever called back in.

What a host's calls get from it is ordering. A `start()` made from the report of
an ending puts its story up inside the call that made the report, so a host
watching sees one tour replaced by another. Queue it and the machine has gone
idle by the time it runs, so the same host sees a tour that ended, a turn of
nothing, and then a tour that began. The test named *start from inside onStep
runs there, before stop returns* pins that down. A queue would also have to tell
a host's `start` apart from a `drawn` the machine owes itself, which is a
distinction nothing in `plan.ts` has to make today.

## Watching `state`

`watch(listener)` says when `state` changed and hands back the way to stop. With
`state` itself as the snapshot, that is both halves of a React
`useSyncExternalStore`. Without it a host that wants to disable its own controls
while the tour is between things has to read `state` on a timer, because
`onStep` fires when the tour arrives somewhere and `state` moves three times
that no arrival explains: a morph landing, a story's `onEnter` in flight before
any step exists, and a target being looked for again.

**It fires on the derived value, not on the fields it is read from.** `settling`
to `ready` is a crossing a watcher should hear. `story` to `step` is not, and
neither is a call that wrote a field the answer does not depend on.

**One call per turn.** `enter` writes the phase twice on its way to a step that
is not on screen yet, and a story handing the tour on commits three times before
the story that follows is up. A watcher told
about each write would see a flicker that never existed for anybody, so the
answer is compared with what it was when the turn started and reported only if
the two differ. A run that starts and settles inside one turn says `running`
once.

**Nothing is called from inside a machine operation.** A watcher is application
code, and one calling `stop()` would be doing it half way through an arrival,
which is the reentrancy the gate above exists to keep out. The call goes in a
microtask, which is after the operation and still before the next task.

**It carries the state and nothing else.** `onStep` carries the step and the one
before it. A watcher carrying both would be one hook doing two jobs, and a
listener could not tell which of them woke it.

The notify has one place to live. Every field the machine holds is replaced
through `commit`, and `commit` is what calls it, so a new write cannot forget to
announce itself. That is the same bargain `state` being derived struck, one
level up.

## Gathering the vocabulary from the call sites

A signal name is a string on both sides, and a typo does not fail. The step
waits, nothing advances, and the console says nothing, because a signal nobody
waits for is silent by the rule above. That rule is right for instrumentation.
It is no help to a person guessing at a string.

So something outside the type system gathers them. `packages/codegen/` walks the
project, collects every name a `reached()` call reports, and writes a
declaration file that augments an interface the core exports empty. The compiler
cannot do this alone. It reads a declaration and flows it out to the uses, and
it never runs backwards from call sites to a type.

```ts
export interface LekoSignals {}
export interface LekoStrict {}
```

A project that never runs the generator has both empty, `awaits` as `string`,
and nothing to import or configure. **A project that wants none of this cannot
tell it shipped.** The interfaces hold no values, so nothing reaches a bundle.

It asks the compiler rather than the text, so a name kept in a constant counts
from a file away. A name built at runtime cannot be gathered, and the generator
prints every call like that rather than passing over it. A project with any of
them wants `--loose`.

**Strict on `awaits`, never on `reached()`.** A name in `awaits` that is missing
from the vocabulary is a step waiting for a report nothing in the project makes.
It advances for nobody, so it fails to compile. A list maintained by hand is
only as complete as somebody remembered to make it, and a list gathered from the
code is a fact about the code. Only the second kind should fail a build. A type
error on `reached()` would talk people into deleting the call.

**The augmenting file has to be a module.** Drop that block into a file with no
`import` and no `export` of its own and `declare module` declares an ambient
module instead. No completion appears, and no error explains why. A declaration
file outside the tsconfig's `include` is compiled by nobody and fails the same
silent way. The generator checks its own output against the project after
writing it and says so, because nothing else will.

What this deliberately leaves alone. **A declared name nobody awaits is normal
and permanent**, so it is not checked. **Story ids are outside the vocabulary**,
left out to keep the first version small. **The generator stays out of the
core**, which takes no third-party dependencies and would need the TypeScript
compiler API.

`target` has the same hole, with an easier answer. Signal names had to be
gathered from the call sites because nowhere else knows them. Element names can
be declared. One table of name to selector gives `keyof` the union of names a
step may point at. **The usual weakness of a hand-maintained list does not bite
here**, because a name missing from the table means the element cannot be
targeted and nothing more. Adopting it means answering one more question at the
same time: what happens when a name matches several elements.

## What Leko does not do

Leko manages the sequence of steps and draws them. The state the application is
in, and the way a tutorial is dressed, stay with the application. Typing into an
input on the user's behalf, intercepting keystrokes, moving a cursor across the
screen, revealing a message one character at a time. Each of these reaches into
the host's reactivity model or imposes a visual language on it. None of them is
geometry. **Because Leko never places an element over the target, the
application is free to drive the real elements while a step is showing.**

**A story that is not running observes nothing.** Progress recorded while nobody
was shown a step is not evidence that the user followed it. Starting one is
`start(story)`, which the application asks for on purpose. A signal cannot
start a story for the same reason. **Time passing does not advance a step
either.** A step that ends after five seconds has established nothing about
whether the user did anything.

**There are no chapters.** Grouping steps, jumping between the groups, recording
how far somebody got. All of it is worth wanting, and none of it is here. Give a
chapter setup of its own and it stops being a label and becomes an object, and
`index` starts counting something else. A step has an `id` and nothing else the
application may hang things on: a table from id to chapter, written where the
chapters are drawn, is what covers this, and it costs the library no concept at
all. `story-setup.ts` does exactly that.

## Drawing

A cutout is a `clip-path`, never a stack of elements. The `clip-path` on
`.leko-scrim` is a single `path(evenodd, …)`, an outer rectangle plus one
rounded-rectangle subpath per cutout. Five cutouts cost five subpaths and no
more elements than one
([`spike/cutout-techniques/`](spike/cutout-techniques/), T5). Even-odd turns
each inner subpath into an absence of geometry rather than a transparent
overlay. Winding direction does not matter under it.

**`clip-path` cannot read layout**, and no CSS route exists from an element's
box to a `clip-path`. `anchor()` resolves only in inset properties. So JS
measures the targets and writes the path (T3). **It measures at step boundaries,
never per frame.**

### Scrolling

The scrim lives **inside** the scrolling content, sized to it, with the path in
content coordinates. Scrolling moves scrim and targets together and nothing
needs recomputing. **Scroll tracking runs no JS at all** (T6a and T6b, and
`nested-scroller.ts`).

That leaves the rest of the page, so there is **one scrim per scrolling
ancestor**, innermost first and always ending at the document. Only the
innermost carries the step's cutouts. Each outer one is cut to the **padding
box** of the scroller nested inside it. Cut it to the border box and the
scroller's own border stays lit as a hairline.

**Every layer paints and catches nothing. Plain rectangles in the gaps between
the cutouts do the blocking** (`complementRects`). A `clip-path` takes an
element out of hit-testing but **not** out of the search for what a wheel should
scroll, so a scrollable element under a hole stops scrolling under the pointer.
Firefox routes such a wheel to the element, Chromium does so only while the
scrim's own container has nothing left to scroll, and WebKit never does
([`spike/wheel-through-a-hole/`](spike/wheel-through-a-hole/), and
`scrollable-target.ts`).

**Do not go back to blocking with the clipped element**, however much tidier one
element looks. `elementFromPoint` reports the hole open the whole time the
scrolling is broken, so the tests check this by geometry. Rectangles also make
constraint 1 true by construction. They are built from the complement of the
cutouts, so nothing of Leko's can be over a target even in principle.

That is also why **only one story is ever visible**. A second story's rectangles
are the complement of a *different* set of holes, so they land squarely on the
first story's target.

### The morph

Every path emitted here has the same segments in the same order, so two of them
blend by walking their numbers in step. **Changing the number of cutouts breaks
that correspondence. Collapse a departing cutout to zero area rather than
dropping its subpath** (T7 and T8).

**The blend is written frame by frame from the main thread.** Handing
`clip-path` to the Web Animations API puts it on the compositor, and Chrome
rasterises a composited clip path at the wrong scale on a 2x display. Check that
on a 2x display before moving this back onto `element.animate()`
([`spike/waapi-clip-path/`](spike/waapi-clip-path/), and
[crbug.com/542859657](https://issues.chromium.org/issues/542859657)).

The morph is driven by `requestAnimationFrame`, so **it stops in a tab nobody is
looking at**. Nothing is broken. It resumes and finishes the moment the tab is
looked at again, and a signal arriving in that window still advances the step,
because `advance()` reads the in-flight flag rather than `state`.

**Any change that reintroduces per-frame JS position math is a regression.**
That rule is about reading layout while the user scrolls, which is where jank
comes from. A bounded morph writing a precomputed string each frame reads
nothing and is a different thing.

### The message

**The message is in the top layer, anchored to the target.** It cannot go where
the scrim goes, because the scroller would clip it at its own edge, and the edge
is where a message needs room. It cannot be positioned from measurements either.
That is JS on every scroll again.

The action target is given an `anchor-name` and gets back whatever it had when
the tour lets go. The message is a `popover`, so it sits over the scrim without
bidding on a `z-index` the host page can always outbid. An anchor-positioned
element is offset by the scroll of everything between it and its anchor, by the
browser.

JS picks the side once per step and turns the distance between the anchor and
the furthest cutout into a margin, so the message clears every hole rather than
only the one it is named after. `position-try-fallbacks` covers what a
measurement could not, and it is an enhancement on top of that choice rather
than the mechanism.

**The core has no third-party runtime dependencies and must stay that way.** A
scalar tween is all this needs, and a dependency here would be a licensing and
bundle-size liability for every consumer. `@annetaan/leko-spotlight` ships from
this repository under the same licence, so the rule is not about it.

## Three packages, and the seam between them

- `packages/machine` decides which step the tour is on. **Its `lib` is `ES2023`
  alone, so a `document` there is a compile error.** Its tests run in Node
  against a fake.
- `packages/spotlight` draws the scrim, the hole and the message. It does not
  know what a step is.
- `packages/leko` wires the two together, owns the public types, and is the only
  one that publishes.

What each half may ask of the other is `Presenter` and `Host` in
`packages/machine/src/types.ts`.

**The presenter never schedules itself.** It reports what it noticed through
`Host` and waits. Whether the tour may be measured at all is a fact about the
machine's state, and one owner for that guard is the point.

**The presenter never decides whether there is a next control.** `Content.next`
is filled in by the machine, derived from `awaits`. The second constraint
depends on that rule, and a presenter free to decide it would be a way to
configure the rule back off.

**The presenter is told, and never asks back.** None of `Host`'s five members
returns anything, and no member of `Presenter` takes a story. The drawing half
is handed steps and never asks what one belongs to, which is what the two-tier
read in **Settings, and where they are read from** pays for.

`Target` and the three state literals are written out in both
packages. That is deliberate while the lower two are private, since a published
`.d.ts` referring to `@annetaan/leko-machine` would not resolve in anyone's
project. `@annetaan/leko` bundles both halves in with `tsdown`, so a consumer
installs one package with no runtime dependencies. **`pnpm check:pack` reads
what `npm pack` would send and fails on a bare import the manifest does not
depend on.**

## How to write here, and where tests go

**Write in a functional style wherever the code allows it.** Everything
difficult in this library is geometry. `geometry.ts` takes numbers and returns
numbers, touches no DOM, and can therefore be tested by stating properties
rather than by driving a browser: *no blocking rectangle ever overlaps a hole*,
*every path has the same segment list*. Reading layout, writing styles and
owning the lifetime of an element cannot be pure, so they stay in `scrim.ts`,
`message.ts` and `presenter.ts` and stay small. When a piece of logic gets hard
to follow inside a class, it usually wanted to be a function in `geometry.ts`
with a test of its own.

**jsdom is not an option for anything about layout.** It has no layout, so a
claim about where a box ended up or what hit-testing returns at a point cannot
be tested with it. **What sorts a test is whether a browser could get the answer
wrong**, not whether the test mentions the DOM. The table of which project a
test belongs in is in [ONBOARDING.md](ONBOARDING.md).

All three engines run because the two things the library is built on are ones
engines disagree about: what `clip-path: path()` interpolates, and how much of
anchor positioning exists. A test depending on the second asks `CSS.supports`
first. **Playwright's WebKit is a WebKit build, not a Safari anyone can
install.** The floor still has to be checked on the real thing.

`machine.test.ts` sits in `describe` groups, one per axis the machine is asked
about. **Read them as a table.** A group holding two tests is a column nobody
has crossed with the others, and that is where the next bug is.

**The sandbox is not a showcase.** Every case is something a user *does*. A demo
where the user only watches proves nothing about a library whose whole claim is
that they do not. It is also the first consumer of the public types, so an API
that reads badly in `src/cases/` reads badly everywhere. **`spike/` pages are
dependency-free and use no Leko.** Add one whenever a decision would otherwise
rest on trust.

## Browser support

The cutout needs `clip-path: path()` and interpolation between two path values.
**The floor this implies has not been measured. Do not quote one until it has.**
The source also uses ES2023 array methods, which is a floor of its own and a
lower one.

CSS Anchor Positioning (Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the
message beside a cutout and does nothing else, so it degrades rather than fails.
Without it the message docks to the foot of the viewport, which is plainer than
being beside the hole and never points at the wrong place. `@position-try` and
`position-try-fallbacks` need Safari 26+, so neither may carry anything on its
own.

## Where things are written down

| | |
| --- | --- |
| A rule, and why it holds | this file |
| Evidence that a browser does not do what the spec suggests | [`spike/`](spike/) |
| A situation a tour meets | [`examples/sandbox/src/cases/`](examples/sandbox/src/cases/) |
| The machine's states, in a form a search can walk | [`packages/machine/model/`](packages/machine/model/) |
| How to walk the code, the layout, which project a test goes in | [ONBOARDING.md](ONBOARDING.md) |
| How to work in the repository | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Which implementation came before, and what it got wrong | the commits |

**This file carries no history.** Where a rule came out of a bug, what gets
written is the rule in the present tense and a pointer to the page or case that
shows it.
