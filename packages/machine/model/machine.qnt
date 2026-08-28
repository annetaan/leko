// `packages/machine/src/plan.ts`, written down as a state machine so that a
// search can walk it. Read `README.md` beside this file first: it says what this
// covers, what it does not, and what to do when the two disagree.
//
// `position` and `phase` are the two fields of its `Core`, under those names.
// `drawn`, `presenterUp` and `inflight` are things the code keeps implicitly and
// a model has to say out loud. Every definition that mirrors one in `plan.ts`
// names it in its doc, because three of them are spelled differently there:
// `end` is `ending`, `enter` is `entering`, and `enterStory` is `opening`.
//
// **Nothing the machine calls hands anything back.** An arrival runs start to
// finish inside one action, so the `Story` and `Step` phases are never a state
// this rests in and nothing is parked for one. The one late thing left is the
// window a teardown opens.
module machine {
  // ---------------------------------------------------------------- the world

  type Maybe[a] = Just(a) | Nothing

  /// `Phase` in plan.ts, with the same four values and the same meanings.
  type Phase = Story | Step | Ending | Ready

  /// Which step the tour is on. `position` in plan.ts, by story id rather
  /// than by object, because a model has no object identity to lean on.
  ///
  /// `occurrence` is that identity written down. `position` in `plan.ts` is an
  /// object replaced on every move and on nothing else, and every late callback
  /// compares itself against it with `===`, so a tour that ends and starts the
  /// same story again is standing somewhere new even though the story and the
  /// index read the same. Nothing but {@link stillAt} looks at this.
  type Pos = { story: str, index: int, occurrence: int }

  /// A step in the world, by address. What a presenter names when it reports
  /// about the step it was shown, which is a step and never a position:
  /// `Host.lost` is answered against `stepOf(core)` in `plan.ts` rather than
  /// against `position`.
  type Where = { story: str, index: int }

  /// What a step is, reduced to the five things the machine reads off one.
  ///
  /// `hasGuard` is `validate` being present. Whether it passes is nondeterministic
  /// at the point it is asked, because `validate` reads the page and the page
  /// moves; pinning it per step would make a step either a wall or a formality.
  ///
  /// `hasWords` is `error` being present. It is fixed per step rather than
  /// nondeterministic: whether a step has words for a refusal is written down
  /// when the story is, and the machine asks for them in the turn the guard
  /// said no.
  type StepSpec = {
    id: str,
    target: str,
    awaits: Maybe[str],
    hasGuard: bool,
    hasWords: bool,
    throwsOnEnter: bool,
  }

  /// `next` is the story this one hands the tour to when it runs out of steps.
  /// Fixed per story here. The code asks a function and the answer may vary, and
  /// what the model has to reach is the pair: a story that chains and a story
  /// that ends.
  type StorySpec = {
    id: str,
    steps: List[StepSpec],
    next: Maybe[str],
    throwsOnEnter: bool,
  }

  /// The one window the code opens and comes back to.
  ///
  /// A teardown that has emptied the machine and not yet run the handlers it
  /// owes. `machine.ts` does the whole of that inside one call and never
  /// returns to the event loop in the middle, so this is not a promise. It is a
  /// window: `onLeave` and the ending `onStep` are application code, and an
  /// application inside one can call straight back in.
  ///
  /// `into` is the story a `start` is displacing this one with. It decides
  /// whether the curtain goes up before the report, and what happens after.
  ///
  /// It carries a token because two teardowns at the same position are two
  /// occurrences, and a set keyed on position alone would silently keep one.
  type Callback = Leaving({ token: int, into: Maybe[str] })

  /// Every field at once, so that the definitions below can be pure functions of
  /// the shape `M => M` and read like the methods they stand for.
  type M = {
    // --- what `Core` in `plan.ts` holds
    position: Maybe[Pos],
    phase: Phase,
    // --- what the code keeps implicitly
    // The step the presenter was last given and has on screen. Cleared by
    // `hold` and by `teardown`, because both take it off.
    drawn: Maybe[Pos],
    // Whether anything of this tour is on the page. `hold` and `show` put it
    // up, `teardown` takes it down.
    presenterUp: bool,
    inflight: Set[Callback],
    nextToken: int,
    // --- the world the tour runs in
    world: str -> StorySpec,
    // Which targets are on the page. `Fake.page` in `machine.test.ts`.
    page: Set[str],
    // What the last action did, in enough detail to aim at. `mbt::actionTaken`
    // already names which action ran; this says which way it went, which is
    // what a harvest has to be able to ask for. Nothing reads it but
    // `scripts/model-traces.mjs` and the assertions in `replay.test.ts`.
    mark: str,
  }

  // ---------------------------------------------------------- the bounded world
  //
  // Two stories that run, one that throws on its way in and one with nothing in
  // it. Five steps between the two that run, which is one more than the issue's
  // estimate of what would have caught the four bugs it was opened for.
  //
  // `packages/machine/src/replay.test.ts` builds its fixture from this, read out
  // of the trace, rather than from a second copy written by hand.

  pure val WORLD: str -> StorySpec = Map(
    // Runs. Its first step advances on a control, its second on a signal, and
    // its last two on a control behind a guard —
    // one with `error` written on it and one without, because a refusal with
    // nothing to say still has to shake the cutout.
    "a" -> {
      id: "a",
      // Hands the tour on when it runs out, which is the whole of `chain-into`.
      next: Just("e"),
     
      throwsOnEnter: false,
      steps: [
        { id: "a1", target: "first", awaits: Nothing, hasGuard: false, hasWords: false, throwsOnEnter: false },
        // A step with both. The guard is ignored on a step that declares
        // `awaits`, and this is the pair that says so.
        { id: "a2", target: "second", awaits: Just("saved"), hasGuard: true, hasWords: false, throwsOnEnter: false },
        { id: "a3", target: "third", awaits: Nothing, hasGuard: true, hasWords: true, throwsOnEnter: false },
        { id: "a4", target: "third", awaits: Nothing, hasGuard: true, hasWords: false, throwsOnEnter: false },
      ],
    },
    // A story whose second step throws on the way in.
    "b" -> {
      id: "b",
      next: Nothing,
     
      throwsOnEnter: false,
      steps: [
        { id: "b1", target: "target", awaits: Just("sent"), hasGuard: false, hasWords: false, throwsOnEnter: false },
        // Throws on the way in, which is the only way `enter`'s catch is reached.
        { id: "b2", target: "first", awaits: Nothing, hasGuard: false, hasWords: false, throwsOnEnter: true },
      ],
    },
    // Throws in its own `onEnter`, which is a different catch from the one above.
    "c" -> {
      id: "c",
      next: Nothing,
     
      throwsOnEnter: true,
      steps: [
        { id: "c1", target: "first", awaits: Nothing, hasGuard: false, hasWords: false, throwsOnEnter: false },
      ],
    },
    // Nothing in it. `start` must refuse it without tearing down the tour that
    // is running.
    "d" -> { id: "d", steps: [], next: Nothing, throwsOnEnter: false },
    // Where "a" hands the tour to, and the end of the chain. One step, nothing
    // in the way of it, so a run that gets here runs out and `chain-ends` is
    // what that looks like.
    "e" -> {
      id: "e",
      next: Nothing,
     
      throwsOnEnter: false,
      steps: [
        { id: "e1", target: "first", awaits: Nothing, hasGuard: false, hasWords: false, throwsOnEnter: false },
      ],
    },
  )

  /// The names a call site might report. `"none"` is one no step waits for, and
  /// an unmatched signal has to be free and silent.
  pure val SIGNALS = Set("saved", "sent", "none")

  /// `PAGE` in `machine.test.ts`.
  pure val TARGETS = Set("first", "second", "third", "target")

  // ------------------------------------------------------------------ reading

  var m: M

  // Both take a {@link Pos} or a {@link Where}, because a story and a step are
  // found by address and the occurrence is no part of finding one.

  pure def storyOf(s: M, at: { story: str, index: int | r }): StorySpec = s.world.get(at.story)

  pure def stepAt(s: M, at: { story: str, index: int | r }): StepSpec =
    storyOf(s, at).steps[at.index]

  /// `accepting` in `plan.ts`. The one thing a call from the application is answered
  /// against.
  pure def accepting(s: M): bool = s.phase == Ready

  /// `stateOf` in `plan.ts`, derived from two fields and never stored.
  pure def stateOf(s: M): str =
    match s.position {
      | Nothing => "idle"
      | Just(_) => "running"
    }

  /// Whether `at` still names the step occurrence the tour is standing on.
  /// Every late callback in `plan.ts` asks this, by comparing the captured
  /// `position` object with the current one, which is why the occurrence is
  /// part of the comparison here and not just the story and the index.
  pure def stillAt(s: M, at: Pos): bool = s.position == Just(at)

  /// Whether `w` names the step the tour is standing on, whichever occurrence
  /// of it. `stepOf(core) !== event.step` in `plan.ts`, which is what `lost`
  /// asks instead of {@link stillAt}: a presenter watches the step it was
  /// shown, so what it can name is a step.
  pure def standingOn(s: M, w: Where): bool =
    match s.position {
      | Nothing => false
      | Just(at) => stepAt(s, at) == stepAt(s, w)
    }

  // ------------------------------------------------------------ the machinery
  //
  // One pure function per method, in the order the calls nest, so that nothing
  // below refers to anything above it.

  pure def park(s: M, mk: int => Callback): M =
    s.with("inflight", s.inflight.union(Set(mk(s.nextToken))))
     .with("nextToken", s.nextToken + 1)

  /// Stand the tour on a step, as a step occurrence nothing has stood on
  /// before. `plan.ts` writes `{ ...core, position: at }` and the fresh object
  /// is the fresh occurrence; here it is a number off the same supply the
  /// callbacks draw their tokens from.
  ///
  /// The three callers are the three writes of `position` in `plan.ts`:
  /// `opening` twice, once for a `start` from idle and once for the story that
  /// displaced a run, and `moveOn` for every step after the first.
  pure def standOn(s: M, at: Pos): M =
    s.with("position", Just(at)).with("nextToken", s.nextToken + 1)

  /// `ending` in `plan.ts`. `next` is a story only where `start` displaces this one.
  ///
  /// An ending with somewhere to go stays closed through its own report; one
  /// with nowhere to go opens first.
  pure def end(s: M, into: Maybe[str]): M =
    match s.position {
      | Nothing => s
      | Just(_) => {
        val torn =
          s.with("phase", Ending)
           .with("position", Nothing)
           // teardown()
           .with("presenterUp", false)
           .with("drawn", Nothing)
        // And there it stops. What is owed is two `onLeave` calls and a report,
        // all of them application code, and {@link doLeave} is the rest of it.
        park(torn, (t) => Leaving({ token: t, into: into }))
      }
    }

  /// The `entryFailed` event. The rethrow is invisible to state.
  pure def failed(s: M, at: Pos): M =
    if (stillAt(s, at)) end(s, Nothing) else s

  /// The `lost` event, for the two places the machine reaches it from inside
  /// its own work: `show` handed a missing anchor, and `resolve` answering null
  /// where a guard was about to be asked. {@link doLose} is the third, and asks
  /// {@link standingOn} instead, because there the presenter names the step.
  pure def lose(s: M, at: Pos): M =
    if (stillAt(s, at)) end(s, Nothing) else s

  /// The `stepEntered` event. Hands the step over, and that is the whole of it:
  /// `Presenter.show` gives nothing back and nothing waits for it.
  pure def draw(s: M, at: Pos): M = {
    val step = stepAt(s, at)
    // `Fake.show` answers a missing anchor with `Host.lost`, so the run can be
    // over before `show` returns.
    if (not(s.page.contains(step.target)))
      lose(s.with("presenterUp", true), at)
    else
      s.with("presenterUp", true).with("drawn", Just(at))
  }

  /// The `drawn` event. Draw the step, then say the tour moved, in that order.
  pure def arrive(s: M, at: Pos): M =
    if (not(stillAt(s, at))) s
    else {
      // Opened before `draw`, because a lost anchor can end the run from inside
      // it and the report of that ending has to find a machine a host may call.
      // Nothing is written down. The report is the whole of the event, which
      // is why `Core` has no field for where the tour came from.
      draw(s.with("phase", Ready), at)
    }

  /// `entering` in `plan.ts`. Enter the step `position` now names.
  pure def enter(s: M): M =
    match s.position {
      | Nothing => end(s, Nothing)
      | Just(at) => {
        val story = storyOf(s, at)
        if (at.index >= story.steps.length()) end(s, Nothing)
        else {
          val step = stepAt(s, at)
          // Nothing is drawn for this window and nothing is taken down for it
          // either. `onEnter` answers in the turn, so no frame carries it.
          val held =
            s.with("phase", Step)
          if (step.throwsOnEnter) failed(held, at)
          else arrive(held, at)
        }
      }
    }

  /// `opening` in `plan.ts`. Outermost first: the story's own `onEnter` before
  /// anything about its first step.
  pure def enterStory(s: M, at: Pos): M = {
    val story = storyOf(s, at)
    val held = s.with("phase", Story)
    if (story.throwsOnEnter) failed(held, at)
    else if (stillAt(held, at)) enter(held)
    else held
  }

  /// `moveOn` in `plan.ts`, the half of advancing after the guard: the last step ends the run,
  /// and every other one moves on.
  /// `mark` is the caller's, because a press and a signal reach this the same
  /// way. Running out of steps writes its own instead: what happened there is
  /// the chain being asked, and which way it answered is the half worth aiming
  /// at.
  pure def moveOn(s: M, at: Pos, mark: str): M = {
    val story = storyOf(s, at)
    if (at.index >= story.steps.length() - 1)
      // `Effect.chain` and the `chained` event in `plan.ts`. One turn there and
      // one step here, because nothing the model can interleave sits between
      // them: `next` is asked and answered inside one `dispatch`.
      match story.next {
        | Nothing => end(s, Nothing).with("mark", "chain-ends")
        | Just(id) => end(s, Just(id)).with("mark", "chain-into")
      }
    else
      enter(standOn(s, { story: at.story, index: at.index + 1, occurrence: s.nextToken }))
        .with("mark", mark)
  }

  /// `advance` in `plan.ts`. `guardOk` is what `validate` answered, and the
  /// refusal is settled in the same turn: there is no handler left to answer
  /// later.
  ///
  /// A step that declares `awaits` is not guarded. The application has already
  /// said the thing happened, and reading the page to check would be a second
  /// source of truth for the same question.
  pure def advance(s: M, at: Pos, guardOk: bool, mark: str): M = {
    val step = stepAt(s, at)
    if (not(step.hasGuard) or step.awaits != Nothing)
      moveOn(s, at, mark)
    else if (not(s.page.contains(step.target)))
      // `resolve` answered null, which `advance` hands to `lose`.
      lose(s, at).with("mark", "press-lost")
    else if (guardOk)
      moveOn(s, at, mark)
    else
      // The guard said no. Saying no is not optional and saying why is: the
      // cutout is shaken whichever way, and a step with `error` also puts words
      // under the instruction. `plan.ts` reads both off the step, so neither is
      // a choice a handler makes. Nothing is written down either way: what is
      // on screen belongs to whatever draws it.
      s.with("mark", if (step.hasWords) "refuse-said" else "refuse-mute")
  }

  // ----------------------------------------------------------------- the calls
  //
  // One action per way into the machine. Which group an action is in is the
  // whole of the second constraint, so the groups are named.

  // --- what a host calls, and what the gate answers

  // The gate is inside these rather than in front of them. A call a host makes
  // while an arrival is in flight is a call that happened, and what has to be
  // true of it is that nothing moved — which is not something a search can look
  // for in a call it never makes.

  /// `start` never ends a tour. Three ways it comes to nothing and one way it
  /// takes, and all four leave the run that was showing exactly as it was.
  action doStart(id: str): bool = all {
    m' =
      if (not(accepting(m))) m.with("mark", "refused-start")
      // A tour is running and `stop()` is the way out of one. Told apart from
      // the refusal above because the fix is a different call rather than a
      // second attempt at this one.
      else if (m.position != Nothing) m.with("mark", "start-running")
      else if (m.world.get(id).steps.length() == 0)
        // A story runs from its first step and there is no first step here.
        m.with("mark", "empty-story")
      else {
        val at = { story: id, index: 0, occurrence: m.nextToken }
        enterStory(standOn(m, at), at).with("mark", "start")
      },
  }

  action doReached(name: str): bool = all {
    m' =
      match m.position {
        | Nothing => m.with("mark", "unmatched")
        | Just(at) => {
          val step = stepAt(m, at)
          if (step.awaits != Just(name)) m.with("mark", "unmatched")
          // Matched, and dropped anyway. The step goes on waiting for something
          // the application has already been through.
          else if (not(accepting(m))) m.with("mark", "refused-signal")
          else advance(m, at, true, "reached")
        }
      },
  }

  /// `stop()` asks nothing, and is the only call that does not. It is also the
  /// whole of "a `stop()` from inside `onEnter`": nothing gates it, so this
  /// action fires while the phase is `story` or `step` like any other.
  action doStop = all {
    m' = end(m, Nothing).with("mark", "stop"),
  }

  // --- what the presenter reports

  /// `Host.next`, the only way a step advances without a signal being named.
  ///
  /// Offered only where a control was drawn, which is the presenter's side of
  /// the rule: no control on a step that declares `awaits`, and none at all
  /// while an arrival is in flight. `drawn` being the step the tour is on is
  /// what says the second, and it is why the gate is a precondition here and
  /// sits in the body of the calls above.
  action doPress(guardOk: bool): bool = all {
    match m.position {
      | Nothing => false
      | Just(at) => and {
        stepAt(m, at).awaits == Nothing,
        m.drawn == Just(at),
      }
    },
    m' =
      match m.position {
        | Nothing => m
        // The mark is {@link advance}'s to write, because a press that is
        // refused and a press that moves the tour are the two halves this
        // action exists to tell apart.
        | Just(at) => advance(m, at, guardOk, "press")
      },
  }

  // The one below does not ask where the tour is first. A presenter watches the
  // step it was shown, and a step can leave the page after the tour has already
  // started heading somewhere else, so a report about a step nobody is standing
  // on is a report that really arrives. Deciding what it means is the machine's,
  // and that is the half worth checking.
  //
  // It names a {@link Where} rather than a {@link Pos}, because that is what the
  // presenter has to name with: `lost` carries a step, and `plan.ts` answers it
  // against `stepOf(core)`. A step reported for the occurrence before the tour
  // restarted is a report about the step the tour is on, and the machine takes
  // it.

  /// `Fake.lose`: the target left the page and did not come back inside the
  /// retry, so the presenter has given up on it. The retry itself is not here:
  /// nothing about it reaches the machine.
  action doLose(w: Where): bool = all {
    m' = {
      val gone = m.with("page", m.page.exclude(Set(stepAt(m, w).target)))
      if (standingOn(gone, w)) end(gone, Nothing).with("mark", "lose")
      else gone.with("mark", "lose-stale")
    },
  }

  // --- what a teardown owes

  /// The rest of an ending: the two `onLeave` calls, the curtain where there is
  /// nothing following the report, and the report.
  ///
  /// **The window is the state this leaves behind, not this action.** Between
  /// {@link end} parking a `Leaving` and this taking it off, the machine is
  /// emptied and the phase is closed, which is exactly where `machine.ts`
  /// stands while it runs handlers. Every other action is offered there, and
  /// what has to be true is that none of them moves anything.
  ///
  /// `machine.ts` runs the whole of this inside the call that began it, so a
  /// model resting here is more permissive than the code. Nothing is lost by
  /// that: with the position empty and the phase closed, every action either
  /// is refused, finds nothing to act on, or is a knob on the world.
  action doLeave(cb: Callback): bool = all {
    m.inflight.contains(cb),
    m' = {
      val awake = m.with("inflight", m.inflight.exclude(Set(cb)))
      match cb {
        | Leaving(c) =>
          match c.into {
            // Nothing follows the report, so a host is free to start a story
            // from it and the curtain goes up first.
            | Nothing => awake.with("phase", Ready).with("mark", "left")
            // An ending with somewhere to go stays closed through its own
            // report, and then the story that was named goes up.
            | Just(id) => {
              val at = { story: id, index: 0, occurrence: awake.nextToken }
              enterStory(standOn(awake, at), at).with("mark", "left-into")
            }
          }
      }
    },
  }

  // ------------------------------------------------------------------ stepping

  pure val FRESH: M = {
    position: Nothing,
    phase: Ready,
    drawn: Nothing,
    presenterUp: false,
    inflight: Set(),
    nextToken: 0,
    world: WORLD,
    page: TARGETS,
    mark: "init",
  }

  /// Nothing running, which is where a host starts.
  action init = all {
    m' = FRESH,
  }

  /// `"a"` already running, for the deep search described beside
  /// {@link stepInside}. It is one `start`, taken in the turn rather than
  /// searched for.
  action initRunning = all {
    m' = {
      val at = { story: "a", index: 0, occurrence: FRESH.nextToken }
      enterStory(standOn(FRESH, at), at)
    },
  }

  /// Every step in the world, so an action that names one can pick from a set
  /// rather than from the tour it happens to be on. A presenter can report a
  /// step the tour has already left, and that is the case worth reaching.
  pure val WHERES: Set[Where] =
    WORLD.keys().map((id) =>
      WORLD.get(id).steps.indices().map((i) => { story: id, index: i })
    ).flatten()

  action step = any {
    nondet startPick = WORLD.keys().oneOf()
    doStart(startPick),
    nondet signalPick = SIGNALS.oneOf()
    doReached(signalPick),
    doStop,
    nondet guardOk = Bool.oneOf()
    doPress(guardOk),
    nondet losePick = WHERES.oneOf()
    doLose(losePick),
    nondet leavePick = m.inflight.oneOf()
    doLeave(leavePick),
  }

  /// The same actions with the three that restart the world taken out, paired
  /// with {@link initRunning}.
  ///
  /// Two searches rather than one, because a uniform choice over {@link step}
  /// makes `stop` about as likely as anything else, and a tour that is torn down
  /// every sixth call almost never reaches its third step. The four bugs
  /// this model was written for were all reachable in under five calls, which
  /// {@link step} covers well; this is what reaches the rest. Neither relation
  /// is the honest one on its own, and `pnpm model` runs both.
  action stepInside = any {
    nondet signalPick = SIGNALS.oneOf()
    doReached(signalPick),
    nondet guardOk = Bool.oneOf()
    doPress(guardOk),
    nondet losePick = WHERES.oneOf()
    doLose(losePick),
    nondet leavePick = m.inflight.oneOf()
    doLeave(leavePick),
  }

  // ---------------------------------------------------------------- invariants
  //
  // Two, because these two are the only ones on the issue's list that a state
  // predicate can see. The rest are claims about what a transition did, and
  // `packages/machine/src/replay.test.ts` carries them against the real code.

  /// 1. `state == "running"` implies there is a step, and the presenter has been
  ///    given it.
  val runningIsDrawn: bool =
    stateOf(m) == "running" implies m.drawn == m.position

  /// 2. `state == "idle"` implies the presenter has been torn down and nothing
  ///    of a run is left behind.
  ///
  /// This used to ask for `phase == Ready` as well, and it held because nothing
  /// could reach a teardown from the outside. `end` empties the position before
  /// it calls anything, so a handler reading `state` from inside an `onLeave`
  /// is told `idle` while the phase underneath is still `Ending`. The two
  /// answer different questions and only one of them is public;
  /// `machine.test.ts` has the case that says so.
  val idleIsClean: bool =
    stateOf(m) == "idle" implies and {
      m.phase == Ready or m.phase == Ending,
      not(m.presenterUp),
      m.drawn == Nothing,
    }

  // ----------------------------------------------------------------- witnesses
  //
  // Not properties. Each one is a state the model was written to reach, and a
  // run reporting 0% for one of them is a model whose actions have stopped
  // describing the code. `pnpm model` passes them to `quint run --witnesses`.

  /// A refusal with words for it, which is the pair below with `error` written
  /// on the step.
  val refusedWithWords: bool = m.mark == "refuse-said"

  /// A refusal with none. The half worth aiming at: the cutout still has to be
  /// shaken, because a guard with nothing to say must not leave the next
  /// control as a button that does nothing.
  val refusedInSilence: bool = m.mark == "refuse-mute"

  /// A story running out of steps and handing the tour to the one it names.
  /// The ending stays closed through its own report, exactly as a `start` that
  /// displaces a run does, so the story that follows is the story that runs.
  val chained: bool = m.mark == "chain-into"

  /// A story running out with nothing after it, which is where a tour stops.
  val chainEnded: bool = m.mark == "chain-ends"

  /// The machine standing inside a teardown, with `onLeave` owed. The window
  /// every call below has to come to nothing in.
  val tearing: bool = m.phase == Ending

  /// One per way into the machine, because a window only one call has been
  /// tried in is a window nobody has really looked into. `stop()` is here for
  /// the opposite reason to the others: it is the one call the gate never turns
  /// down, and what has to be true of it is that a second teardown is not one.
  val startWhileTearing: bool = m.phase == Ending and m.mark == "refused-start"
  val signalWhileTearing: bool = m.phase == Ending and m.mark == "unmatched"
  val stoppedWhileTearing: bool = m.phase == Ending and m.mark == "stop"

  /// A call the gate turned down. Only a `start` can reach this: the window the
  /// gate closes is a teardown, and by then the position is empty, so a signal
  /// arriving in one is unmatched rather than refused. `signal-dropped` is left
  /// to a `reached()` made from inside an `onEnter`, which nothing here models.
  val refused: bool = m.mark == "refused-start"

  /// A `start` made while a tour was running. Not the gate: the phase was open
  /// and the answer is still no, because ending a tour is `stop()`'s job.
  val startWhileRunning: bool = m.mark == "start-running"

  /// A `start` on a story with nothing in it. Refused like the two above and
  /// for a different reason, and the run that was showing has to survive it.
  val emptyStory: bool = m.mark == "empty-story"

  /// The presenter reporting about a step the tour has already left, which it
  /// can do because it watches the step it was shown rather than the tour.
  /// Standing somewhere, so that the report is about another step rather than
  /// about no tour at all.
  val staleReport: bool = m.mark == "lose-stale" and m.position != Nothing

  /// The tour got as far as the last step of the longest story, which is as
  /// deep as this world goes. By address, because which occurrence of it the
  /// tour got there on is not the question.
  ///
  /// Read off `position` rather than off anything the report leaves behind,
  /// because the report leaves nothing behind. A witness is counted for a trace
  /// where it held at any state, and the tour stands here for several before it
  /// ends, so the window is wide enough without a `mark` of its own.
  val reachedLastStep: bool =
    match m.position {
      | Nothing => false
      | Just(at) => at.story == "a" and at.index == 3
    }
}
