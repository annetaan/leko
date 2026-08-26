// `packages/machine/src/machine.ts`, written down as a state machine so that a
// search can walk it. Read `README.md` beside this file first: it says what this
// covers, what it does not, and what to do when the two disagree.
//
// The names here are the names in `machine.ts`. `position`, `phase`, `error`,
// `announced` and `showing` are its five mutable fields; `drawn`, `presenterUp`
// and `inflight` are things the code keeps implicitly and a model has to say out
// loud. Where a definition mirrors a method, it carries that method's name.
module machine {
  // ---------------------------------------------------------------- the world

  type Maybe[a] = Just(a) | Nothing

  /// `Phase` in machine.ts, with the same six values and the same meanings.
  type Phase = Story | Step | Ending | Settling | Searching | Ready

  /// Which step the tour is on. `position` in machine.ts, by story id rather
  /// than by object, because a model has no object identity to lean on.
  type Pos = { story: str, index: int }

  /// What a step is, reduced to the five things the machine reads off one.
  ///
  /// `hasGuard` is `validate` being present. Whether it passes is nondeterministic
  /// at the point it is asked, because `validate` reads the page and the page
  /// moves; pinning it per step would make a step either a wall or a formality.
  type StepSpec = {
    id: str,
    target: str,
    awaits: Maybe[str],
    hasGuard: bool,
    slowEnter: bool,
    throwsOnEnter: bool,
  }

  type StorySpec = {
    id: str,
    steps: List[StepSpec],
    slowEnter: bool,
    throwsOnEnter: bool,
  }

  /// A promise the machine is waiting on, and the one the code is not: a `hold`
  /// that never lands is the same as one that lands late, and both are here.
  ///
  /// Every callback carries a token. Two arrivals at the same position are two
  /// occurrences, and a set keyed on position alone would silently keep one.
  type Callback =
    | EnterStory({ token: int, at: Pos })
    | EnterStep({ token: int, at: Pos })
    | Morph({ token: int, at: Pos })
    // A teardown that has emptied the machine and not yet run the handlers it
    // owes. `machine.ts` does the whole of that inside one call and never
    // returns to the event loop in the middle, so this is not a promise. It is
    // a window: `onLeave` and the ending `onStep` are application code, and an
    // application inside one can call straight back in.
    //
    // `into` is the story a `start` is displacing this one with. It decides
    // whether the curtain goes up before the report, and what happens after.
    | Leaving({ token: int, into: Maybe[str] })

  /// What `onValidationError` was handed, and has not answered with yet.
  ///
  /// `errorUtils` closes over the position the attempt was made at, and a
  /// handler is free to look something up and call back afterwards. So the
  /// utils outlive the call that made them, and the model has to hold them
  /// somewhere rather than spending them where they were handed over.
  type Utils = { token: int, at: Pos }

  /// Every field at once, so that the definitions below can be pure functions of
  /// the shape `M => M` and read like the methods they stand for.
  type M = {
    // --- what `machine.ts` holds
    // `stories`. The keys are what `setStory` has registered.
    registered: Set[str],
    position: Maybe[Pos],
    phase: Phase,
    // `error`, as a bit. Nothing reads the string.
    hasError: bool,
    announced: Maybe[Pos],
    // The token of the morph `draw` last handed back, or nothing.
    showing: Maybe[int],
    // --- what the code keeps implicitly
    // The step the presenter was last given and has on screen. Cleared by
    // `hold` and by `teardown`, because both take it off.
    drawn: Maybe[Pos],
    // Whether anything of this tour is on the page. `hold` and `show` put it
    // up, `teardown` takes it down.
    presenterUp: bool,
    inflight: Set[Callback],
    // Every `ErrorUtils` handed to a handler that has not answered yet.
    holding: Set[Utils],
    nextToken: int,
    // --- the world the tour runs in
    world: str -> StorySpec,
    // Which targets are on the page. `Fake.page` in `machine.test.ts`.
    page: Set[str],
    // Whether the presenter has a morph to run. `Fake.slow`.
    slow: bool,
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
    // Runs. Its first step advances on a control, its second on a signal and
    // through a slow `onEnter`, its third on a control behind a guard.
    "a" -> {
      id: "a",
      slowEnter: false,
      throwsOnEnter: false,
      steps: [
        { id: "a1", target: "first", awaits: Nothing, hasGuard: false, slowEnter: false, throwsOnEnter: false },
        // A step with both. The guard is ignored on a step that declares
        // `awaits`, and this is the pair that says so.
        { id: "a2", target: "second", awaits: Just("saved"), hasGuard: true, slowEnter: true, throwsOnEnter: false },
        { id: "a3", target: "third", awaits: Nothing, hasGuard: true, slowEnter: false, throwsOnEnter: false },
      ],
    },
    // A story whose own `onEnter` is slow, so the `story` phase is a window a
    // call can arrive in.
    "b" -> {
      id: "b",
      slowEnter: true,
      throwsOnEnter: false,
      steps: [
        { id: "b1", target: "target", awaits: Just("sent"), hasGuard: false, slowEnter: false, throwsOnEnter: false },
        // Throws on the way in, which is the only way `enter`'s catch is reached.
        { id: "b2", target: "first", awaits: Nothing, hasGuard: false, slowEnter: false, throwsOnEnter: true },
      ],
    },
    // Throws in its own `onEnter`, which is a different catch from the one above.
    "c" -> {
      id: "c",
      slowEnter: false,
      throwsOnEnter: true,
      steps: [
        { id: "c1", target: "first", awaits: Nothing, hasGuard: false, slowEnter: false, throwsOnEnter: false },
      ],
    },
    // Nothing in it. `start` must refuse it without tearing down the tour that
    // is running.
    "d" -> { id: "d", steps: [], slowEnter: false, throwsOnEnter: false },
  )

  /// The names a call site might report. `"none"` is one no step waits for, and
  /// an unmatched signal has to be free and silent.
  pure val SIGNALS = Set("saved", "sent", "none")

  /// `PAGE` in `machine.test.ts`.
  pure val TARGETS = Set("first", "second", "third", "target")

  // ------------------------------------------------------------------ reading

  var m: M

  pure def storyOf(s: M, at: Pos): StorySpec = s.world.get(at.story)

  pure def stepAt(s: M, at: Pos): StepSpec = storyOf(s, at).steps[at.index]

  /// `Machine.accepting`. The one thing a call from the application is answered
  /// against.
  pure def accepting(s: M): bool =
    s.phase == Ready or s.phase == Settling or s.phase == Searching

  /// `Machine.state`, derived from two fields and never stored.
  pure def stateOf(s: M): str =
    match s.position {
      | Nothing => "idle"
      | Just(_) => if (s.phase == Ready) "running" else "transitioning"
    }

  /// Whether `at` still names the step the tour is standing on. Every late
  /// callback in `machine.ts` asks this, by comparing the captured `position`
  /// object with the current one.
  pure def stillAt(s: M, at: Pos): bool = s.position == Just(at)

  // ------------------------------------------------------------ the machinery
  //
  // One pure function per method, in the order the calls nest, so that nothing
  // below refers to anything above it.

  pure def park(s: M, mk: int => Callback): M =
    s.with("inflight", s.inflight.union(Set(mk(s.nextToken))))
     .with("nextToken", s.nextToken + 1)

  /// `Machine.errorUtils`, handed to `onValidationError` and kept until the
  /// handler does something with it. The position is captured here, which is
  /// what `stale()` reads a second later.
  pure def handOver(s: M, at: Pos): M =
    s.with("holding", s.holding.union(Set({ token: s.nextToken, at: at })))
     .with("nextToken", s.nextToken + 1)

  /// `Machine.end`. `next` is a story only where `start` is displacing this one.
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
           .with("hasError", false)
           .with("announced", Nothing)
           .with("showing", Nothing)
           // teardown()
           .with("presenterUp", false)
           .with("drawn", Nothing)
        // And there it stops. What is owed is two `onLeave` calls and a report,
        // all of them application code, and {@link doLeave} is the rest of it.
        park(torn, (t) => Leaving({ token: t, into: into }))
      }
    }

  /// `Machine.failed`. The rethrow is invisible to state.
  pure def failed(s: M, at: Pos): M =
    if (stillAt(s, at)) end(s, Nothing) else s

  /// `Machine.lose`, reached through `Host.lost`.
  pure def lose(s: M, at: Pos): M =
    if (stillAt(s, at)) end(s, Nothing) else s

  /// `Machine.draw`. Hands the step over, and only the morph nothing has
  /// replaced may call it settled.
  pure def draw(s: M, at: Pos): M = {
    val step = stepAt(s, at)
    // `Fake.show` answers a missing anchor with `Host.lost` and hands nothing
    // back, so the run can be over before `show` returns.
    if (not(s.page.contains(step.target)))
      lose(s.with("presenterUp", true), at)
    else {
      val shown = s.with("presenterUp", true).with("drawn", Just(at))
      if (not(shown.slow))
        shown
      else
        park(shown, (t) => Morph({ token: t, at: at }))
          .with("showing", Just(shown.nextToken))
          .with("phase", Settling)
    }
  }

  /// `Machine.arrive`. Draw the step, then say the tour moved, in that order.
  pure def arrive(s: M, at: Pos): M =
    if (not(stillAt(s, at))) s
    else {
      // Opened before `draw`, because a lost anchor can end the run from inside
      // it and the report of that ending has to find a machine a host may call.
      val drawing = draw(s.with("phase", Ready), at)
      if (not(stillAt(drawing, at))) drawing
      else drawing.with("announced", Just(at))
    }

  /// `Machine.enter`. Enter the step `position` now names.
  pure def enter(s: M): M =
    match s.position {
      | Nothing => end(s, Nothing)
      | Just(at) => {
        val story = storyOf(s, at)
        if (at.index >= story.steps.length()) end(s, Nothing)
        else {
          val step = stepAt(s, at)
          val held =
            s.with("hasError", false)
             .with("showing", Nothing)
             .with("phase", Step)
             // hold(): a curtain, so nothing of this step is drawn
             .with("presenterUp", true)
             .with("drawn", Nothing)
          if (step.throwsOnEnter) failed(held, at)
          else if (step.slowEnter)
            park(held, (t) => EnterStep({ token: t, at: at }))
          else arrive(held, at)
        }
      }
    }

  /// `Machine.enterStory`. Outermost first: the story's own `onEnter` before
  /// anything about its first step.
  pure def enterStory(s: M, at: Pos): M = {
    val story = storyOf(s, at)
    // hold(story, undefined): a curtain, and nothing of this story is drawn.
    val held = s.with("presenterUp", true).with("phase", Story).with("drawn", Nothing)
    if (story.throwsOnEnter) failed(held, at)
    else if (story.slowEnter)
      park(held, (t) => EnterStory({ token: t, at: at }))
    else if (stillAt(held, at)) enter(held)
    else held
  }

  /// The half of `Machine.advance` after the guard: the last step ends the run,
  /// and every other one moves on.
  pure def moveOn(s: M, at: Pos): M = {
    val story = storyOf(s, at)
    if (at.index >= story.steps.length() - 1) end(s, Nothing)
    else enter(s.with("position", Just({ story: at.story, index: at.index + 1 })))
  }

  /// `Machine.advance`. `guardOk` is what `validate` answered. What
  /// `onValidationError` does about a no is a separate action, because it may
  /// answer later or never.
  ///
  /// A step that declares `awaits` is not guarded. The application has already
  /// said the thing happened, and reading the page to check would be a second
  /// source of truth for the same question.
  pure def advance(s: M, at: Pos, guardOk: bool): M = {
    val step = stepAt(s, at)
    if (not(step.hasGuard) or step.awaits != Nothing)
      moveOn(s, at)
    else if (not(s.page.contains(step.target)))
      // `resolve` answered null, which `advance` hands to `lose`.
      lose(s, at)
    else if (guardOk)
      moveOn(s, at)
    else
      // The guard said no. `onValidationError` is handed the utils here and
      // what it does with them is {@link doSetError} and {@link doForget},
      // because a handler is free to answer a second late.
      handOver(s, at)
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

  action doSetStory(id: str): bool = all {
    m' =
      if (not(accepting(m))) m.with("mark", "refused-setStory")
      // A call naming the story the tour is on does nothing, so a component
      // re-registering on every render cannot move the ground under a user.
      else
        match m.position {
          | Just(at) =>
            if (at.story == id) m.with("mark", "setStory-running")
            else m.with("registered", m.registered.union(Set(id))).with("mark", "setStory")
          | Nothing => m.with("registered", m.registered.union(Set(id))).with("mark", "setStory")
        },
  }

  action doStart(id: str): bool = all {
    m' =
      if (not(accepting(m))) m.with("mark", "refused-start")
      else if (not(m.registered.contains(id)) or m.world.get(id).steps.length() == 0)
        // Nothing is torn down until the id is known to be good, so a typo
        // cannot end a tour someone is in the middle of.
        m.with("mark", "start-refused")
      else
        match m.position {
          // Nothing to tear down, so the story goes up in this call.
          | Nothing => {
            val at = { story: id, index: 0 }
            enterStory(m.with("position", Just(at)), at).with("mark", "start")
          }
          // What is ending is told what is starting, and the phase stays closed
          // through the whole of it, report included. The second half of this
          // call is in {@link doLeave}, which is where that report is made.
          | Just(_) => end(m, Just(id)).with("mark", "start-displacing")
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
          else advance(m, at, true).with("mark", "reached")
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
        | Just(at) => advance(m, at, guardOk).with("mark", "press")
      },
  }

  /// `Host.moved`. A resize does not ask what the machine is doing, so this is
  /// offered at any moment; the step is placed rather than replayed, so nothing
  /// changes either way.
  action doResize = all {
    // Not `refused`. Every other refusal is a call a host made and can be told
    // about; this one nobody made, so there is nothing to say and nobody to say
    // it to.
    m' = m.with("mark", if (accepting(m)) "resize" else "resize-ignored"),
  }

  // Neither of the two below asks where the tour is first. A presenter watches
  // the step it was shown, and a step can leave the page after the tour has
  // already started heading somewhere else, so a report about a step nobody is
  // standing on is a report that really arrives. Deciding what it means is the
  // machine's, and that is the half worth checking.

  /// `Fake.lose`: the target left the page and the presenter has given up on it.
  action doLose(at: Pos): bool = all {
    m' = {
      val gone = m.with("page", m.page.exclude(Set(stepAt(m, at).target)))
      if (stillAt(gone, at)) lose(gone, at).with("mark", "lose")
      else gone.with("mark", "lose-stale")
    },
  }

  /// `Fake.hunt`: the target left the page and the presenter is still looking.
  action doHunt(at: Pos): bool = all {
    m' = {
      val gone = m.with("page", m.page.exclude(Set(stepAt(m, at).target)))
      // A wait is only started for the step the tour is on, and only over a
      // phase that says the step is on screen.
      if (not(stillAt(gone, at))) gone.with("mark", "hunt-stale")
      else if (gone.phase == Ready or gone.phase == Settling)
        gone.with("phase", Searching).with("mark", "hunt")
      else gone.with("mark", "hunt-ignored")
    },
  }

  /// `Fake.found`: it came back. Ending a wait asks nothing, because by then the
  /// tour may be on another step and the phase the wait wrote is the one that
  /// has to come off.
  action doFound(at: Pos): bool = all {
    m' = {
      val back = m.with("page", m.page.union(Set(stepAt(m, at).target)))
      if (back.phase == Searching) back.with("phase", Ready).with("mark", "found")
      else back.with("mark", "found-ignored")
    },
  }

  /// Whether the presenter has a morph to run at all. `Fake.slow`.
  action doSetSlow(yes: bool): bool = all {
    m' = m.with("slow", yes).with("mark", "slow"),
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
    match cb {
      | Leaving(_) => true
      | EnterStory(_) => false
      | EnterStep(_) => false
      | Morph(_) => false
    },
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
              val at = { story: id, index: 0 }
              enterStory(awake.with("position", Just(at)), at).with("mark", "left-into")
            }
          }
        | EnterStory(_) => awake
        | EnterStep(_) => awake
        | Morph(_) => awake
      }
    },
  }

  // --- what a failed attempt says about itself

  /// `ErrorUtils.setError`. The words belong on the attempt they were written
  /// about, so a handler answering after the tour has moved writes nothing.
  action doSetError(u: Utils): bool = all {
    m.holding.contains(u),
    m' = {
      val done = m.with("holding", m.holding.exclude(Set(u)))
      if (stillAt(done, u.at)) done.with("hasError", true).with("mark", "set-error")
      else done.with("mark", "set-error-stale")
    },
  }

  /// `ErrorUtils.shake()`. It writes no field, so the mark is the whole of what
  /// this leaves behind, and `replay.test.ts` reads it to know whether the
  /// presenter should have been told to reject.
  ///
  /// A handler that does nothing at all is not an action. It is utils that stay
  /// in {@link M.holding} and are never answered with, which every trace that
  /// ends with one in there already shows.
  action doShake(u: Utils): bool = all {
    m.holding.contains(u),
    m' = {
      val done = m.with("holding", m.holding.exclude(Set(u)))
      if (stillAt(done, u.at)) done.with("mark", "shake")
      else done.with("mark", "shake-stale")
    },
  }

  // --- what lands late

  action doSettle(cb: Callback): bool = all {
    m.inflight.contains(cb),
    match cb {
      | Leaving(_) => false
      | EnterStory(_) => true
      | EnterStep(_) => true
      | Morph(_) => true
    },
    m' = {
      val awake = m.with("inflight", m.inflight.exclude(Set(cb)))
      match cb {
        | EnterStory(c) =>
          if (stillAt(awake, c.at)) enter(awake).with("mark", "settle-story")
          else awake.with("mark", "settle-stale")
        | EnterStep(c) =>
          if (stillAt(awake, c.at)) arrive(awake, c.at).with("mark", "settle-step")
          else awake.with("mark", "settle-stale")
        | Leaving(_) => awake
        | Morph(c) => {
          // Only the morph nothing has replaced may call the step settled.
          if (awake.showing != Just(c.token)) awake.with("mark", "morph-stale")
          else {
            val done = awake.with("showing", Nothing)
            // Only the phase this promise put on the machine is its to take off.
            // A target that left the page while the morph ran has written
            // `searching` over it, and that wait ends when the presenter says.
            if (done.phase == Settling) done.with("phase", Ready).with("mark", "morph-landed")
            else done.with("mark", "morph-under-search")
          }
        }
      }
    },
  }

  /// A slow `onEnter` that rejected. The reason is rethrown on its own, which no
  /// field sees.
  action doFail(cb: Callback): bool = all {
    m.inflight.contains(cb),
    match cb {
      | EnterStory(_) => true
      | EnterStep(_) => true
      | Morph(_) => false
      | Leaving(_) => false
    },
    m' = {
      val awake = m.with("inflight", m.inflight.exclude(Set(cb)))
      match cb {
        | EnterStory(c) => failed(awake, c.at).with("mark", "fail-story")
        | EnterStep(c) => failed(awake, c.at).with("mark", "fail-step")
        | Morph(_) => awake
        | Leaving(_) => awake
      }
    },
  }

  // ------------------------------------------------------------------ stepping

  pure val FRESH: M = {
    registered: Set(),
    position: Nothing,
    phase: Ready,
    hasError: false,
    announced: Nothing,
    showing: Nothing,
    drawn: Nothing,
    presenterUp: false,
    inflight: Set(),
    holding: Set(),
    nextToken: 0,
    world: WORLD,
    page: TARGETS,
    slow: false,
    mark: "init",
  }

  /// Nothing registered and nothing running, which is where a host starts.
  action init = all {
    m' = FRESH,
  }

  /// Every story registered and `"a"` already running, for the deep search
  /// described beside {@link stepInside}. It is one `setStory` per story and one
  /// `start`, taken in the turn rather than searched for.
  action initRunning = all {
    m' = {
      val ready = FRESH.with("registered", WORLD.keys())
      val at = { story: "a", index: 0 }
      enterStory(ready.with("position", Just(at)), at)
    },
  }

  /// Every position in the world, so an action that names one can pick from a
  /// set rather than from the tour it happens to be on. A presenter can report
  /// a step the tour has already left, and that is the case worth reaching.
  pure val POSITIONS: Set[Pos] =
    WORLD.keys().map((id) =>
      WORLD.get(id).steps.indices().map((i) => { story: id, index: i })
    ).flatten()

  action step = any {
    nondet storyPick = WORLD.keys().oneOf()
    doSetStory(storyPick),
    nondet startPick = WORLD.keys().union(Set("nope")).oneOf()
    doStart(startPick),
    nondet signalPick = SIGNALS.oneOf()
    doReached(signalPick),
    doStop,
    nondet guardOk = Bool.oneOf()
    doPress(guardOk),
    doResize,
    nondet losePick = POSITIONS.oneOf()
    doLose(losePick),
    nondet huntPick = POSITIONS.oneOf()
    doHunt(huntPick),
    nondet foundPick = POSITIONS.oneOf()
    doFound(foundPick),
    nondet slowPick = Bool.oneOf()
    doSetSlow(slowPick),
    nondet settlePick = m.inflight.oneOf()
    doSettle(settlePick),
    nondet failPick = m.inflight.oneOf()
    doFail(failPick),
    nondet leavePick = m.inflight.oneOf()
    doLeave(leavePick),
    nondet errorPick = m.holding.oneOf()
    doSetError(errorPick),
    nondet shakePick = m.holding.oneOf()
    doShake(shakePick),
  }

  /// The same actions with the three that restart the world taken out, paired
  /// with {@link initRunning}.
  ///
  /// Two searches rather than one, because a uniform choice over {@link step}
  /// makes `stop` about as likely as anything else, and a tour that is torn down
  /// every thirteenth call almost never reaches its third step. The four bugs
  /// this model was written for were all reachable in under five calls, which
  /// {@link step} covers well; this is what reaches the rest. Neither relation
  /// is the honest one on its own, and `pnpm model` runs both.
  action stepInside = any {
    nondet signalPick = SIGNALS.oneOf()
    doReached(signalPick),
    nondet guardOk = Bool.oneOf()
    doPress(guardOk),
    doResize,
    nondet losePick = POSITIONS.oneOf()
    doLose(losePick),
    nondet huntPick = POSITIONS.oneOf()
    doHunt(huntPick),
    nondet foundPick = POSITIONS.oneOf()
    doFound(foundPick),
    nondet slowPick = Bool.oneOf()
    doSetSlow(slowPick),
    nondet settlePick = m.inflight.oneOf()
    doSettle(settlePick),
    nondet failPick = m.inflight.oneOf()
    doFail(failPick),
    nondet leavePick = m.inflight.oneOf()
    doLeave(leavePick),
    nondet errorPick = m.holding.oneOf()
    doSetError(errorPick),
    nondet shakePick = m.holding.oneOf()
    doShake(shakePick),
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

  /// 2. `state == "idle"` implies the presenter has been torn down, and
  ///    `position`, `error`, `announced` and `showing` are all empty.
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
      not(m.hasError),
      m.announced == Nothing,
      m.showing == Nothing,
      m.drawn == Nothing,
    }

  // ----------------------------------------------------------------- witnesses
  //
  // Not properties. Each one is a state the model was written to reach, and a
  // run reporting 0% for one of them is a model whose actions have stopped
  // describing the code. `pnpm model` passes them to `quint run --witnesses`.

  /// A morph settling for a position the tour has already left.
  val staleMorph: bool =
    m.inflight.exists((cb) =>
      match cb {
        | Morph(c) => not(stillAt(m, c.at))
        | EnterStory(_) => false
        | EnterStep(_) => false
        | Leaving(_) => false
      }
    )

  /// An arrival in flight, which is the window the gate closes.
  val arriving: bool = m.phase == Story or m.phase == Step

  /// A slow `onEnter` outstanding at the same time as a morph.
  val twoInFlight: bool = m.inflight.size() > 1

  /// A step on screen with a failed attempt behind it.
  val erroring: bool = m.hasError

  /// The presenter looking for a target that left the page.
  val hunting: bool = m.phase == Searching

  /// A step drawn and still moving.
  val settling: bool = m.phase == Settling

  /// A morph that landed while the presenter was looking for a target that had
  /// left. Both wrote the phase, and only the one that wrote it may take it off.
  ///
  /// The state to aim at is the one *after* that settle, not the one before it:
  /// a harvested trace ends at the state its target names, so a target naming
  /// the state before would stop the trace one call short of the call it exists
  /// to make. That is what {@link M.mark} is for.
  val morphUnderSearch: bool = m.mark == "morph-under-search"

  /// A handler still holding utils for a step the tour has already left. The
  /// answer it is about to give is the one that has to be dropped.
  val staleUtils: bool = m.holding.exists((u) => not(stillAt(m, u.at)))

  /// That answer, given and dropped.
  val lateError: bool = m.mark == "set-error-stale"

  /// The same second thoughts, said with `shake()` rather than with words.
  val lateShake: bool = m.mark == "shake-stale"

  /// A shake that landed, which is the other half of that pair.
  val shook: bool = m.mark == "shake"

  /// The machine standing inside a teardown, with `onLeave` owed. The window
  /// every call below has to come to nothing in.
  val tearing: bool = m.phase == Ending

  /// One per way into the machine, because a window with only `setStory` in it
  /// is a window nobody has really looked into. `stop()` is here for the
  /// opposite reason to the others: it is the one call the gate never turns
  /// down, and what has to be true of it is that a second teardown is not one.
  val startWhileTearing: bool = m.phase == Ending and m.mark == "refused-start"
  val setStoryWhileTearing: bool = m.phase == Ending and m.mark == "refused-setStory"
  val signalWhileTearing: bool = m.phase == Ending and m.mark == "unmatched"
  val stoppedWhileTearing: bool = m.phase == Ending and m.mark == "stop"

  /// A call the gate turned down.
  val refused: bool =
    m.mark == "refused-start" or m.mark == "refused-setStory" or m.mark == "refused-signal"

  /// The presenter reporting about a step the tour has already left, which it
  /// can do because it watches the step it was shown rather than the tour.
  /// Standing somewhere, so that the report is about another step rather than
  /// about no tour at all.
  val staleReport: bool =
    (m.mark == "lose-stale" or m.mark == "hunt-stale") and m.position != Nothing

  /// The tour reported as far as the last step of the longest story, which is
  /// as deep as this world goes.
  val reachedLastStep: bool = m.announced == Just({ story: "a", index: 2 })
}
