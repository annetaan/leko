// `packages/presenter/src/plan.ts`, written down as a state machine so that a search
// can walk it. Read `README.md` beside this file first: it says what this
// covers, what it does not, and what to do when the two disagree.
//
// `mode` is the plan's `Mode`, under the same five names. `watcher`, `clock`,
// `screen`, `messageUp`, `onPage`, `morphing` and `moving` are what the shell keeps
// implicitly — a field of `DomPresenter`, or a promise the page is holding — and
// a model has to say out loud, because they are what the invariants read.
//
// **The machine is modelled loose.** `show`, `retell` and `teardown` come from
// the machine, and nothing here copies its call discipline: each is offered in
// every mode. That asks the cheaper question — does anything break if it
// arrives — and does not have to be rewritten when the discipline moves.
// `README.md` argues it under **The machine is modelled loose**.
module plan {
  // ---------------------------------------------------------------- the world

  type Maybe[a] = Just(a) | Nothing

  /// What a step is, reduced to the one thing the plan reads off one: whether
  /// it points at anything, and at what. `Nothing` is the step that waits.
  type StepSpec = { id: str, target: Maybe[str] }

  /// `Drawn` in plan.ts: what a viewer is looking at, reason and all. The type
  /// is `Picture` here only because the mode that holds one is `Drawn` below,
  /// and a module has one namespace for both.
  type Picture = { step: str, error: Maybe[str] }

  /// `Pending` in plan.ts. `token` is its object identity written down: the
  /// plan makes one `{ step, animate }` per wait and tells a late clock from
  /// the wait running by comparing the two with `!==`, so two waits for the
  /// same step drawn the same way are still two waits. Nothing but `expired`
  /// looks at the token.
  type Pending = { step: str, animate: bool, token: int }

  /// `Mode` in plan.ts, constructor for constructor. A `Glide` is a token off
  /// the same counter as `Pending`, for the same reason.
  type Mode =
    | Idle
    | Drawn(Picture)
    // `unmeasured` on `Retrying` is the flag of the same name on the mode in
    // plan.ts: the wait a draw with nothing to measure began, which the
    // deadline gives up however the last resolve answers. On the mode rather
    // than on `Pending`, which `Gliding` carries too and where it would mean
    // nothing.
    | Retrying({ pending: Pending, unmeasured: bool, error: Maybe[str], standing: Maybe[Picture] })
    | Deferred({ pending: Pending, error: Maybe[str], standing: Maybe[Picture] })
    | Gliding({ glide: int, pending: Pending, error: Maybe[str], standing: Maybe[Picture] })

  /// `Event` in plan.ts. `anchor` and `found` are `Element | null` there and a
  /// bool here: what the plan reads off either is whether it is null.
  type Event =
    | Show({ step: str, animate: bool })
    | Arrived({ step: str, anchor: bool, animate: bool, glide: Maybe[int], error: Maybe[str] })
    | Retell({ step: str, reason: str })
    | Teardown
    | Settled({ glide: int, anchor: bool })
    | Morphed({ step: str })
    | Mutated({ step: str, found: bool })
    | Unmeasured({ step: str, animate: bool })
    | Expired({ pending: Pending, found: bool })
    | Resized
    | Resolved({ drawn: Picture, saying: bool, found: bool })

  /// `Effect` in plan.ts. `Reword` is its `retell`, renamed because the event
  /// above already has the name. `Hunt` carries no anchor: there is no node to
  /// hold on to yet, and what the model can say is which step is looked for.
  type Effect =
    | Abandon(int)
    | Hide
    | Disarm
    | Hunt({ step: str })
    | Deadline(Pending)
    | Defer(Pending)
    | Cancel
    | Redraw({ drawn: Picture, found: bool, saying: bool })
    | Refit(Picture)
    | Say(Picture)
    | Reword({ step: str, reason: str })
    | Destroy

  /// `Reentrant` in plan.ts.
  type Reentrant =
    | Reveal({ drawn: Picture, anchor: bool, animate: bool })
    | Replace({ drawn: Picture, saying: bool })
    | Arrive({ pending: Pending, error: Maybe[str] })
    | Lost({ step: str })

  /// `Outcome` in plan.ts, plus the mark: which way the event went, in enough
  /// detail for a witness to aim at.
  type Outcome = { mode: Mode, effects: List[Effect], last: Maybe[Reentrant], mark: str }

  /// What the shell is armed for. The one `MutationObserver` in `presenter.ts`
  /// is armed for a hunt and for nothing else — a step on screen watches for
  /// nothing — and this is where the model checks that it is.
  type Watcher = Off | Hunting(str)

  /// The knobs on the page that an effect turns: whether `bringIntoView` had
  /// somewhere to go, whether a draw found anything to measure, and whether the
  /// morph was applied outright rather than animated. Picked by the action and
  /// read by {@link reenter}, because a pure function cannot pick.
  type Knobs = { somewhere: bool, measured: bool, outright: bool }

  /// Every field at once, so that the definitions below can be pure functions
  /// of the shape `M => M`.
  type M = {
    // --- what `plan.ts` holds
    mode: Mode,
    // --- what the shell keeps implicitly
    // `DomPresenter.watcher`, and what it was armed for.
    watcher: Watcher,
    // `DomPresenter.clock`: the clock set and not yet run out or stopped, the
    // wait it was set for, and whether it is a hand-over's frame or a retry's
    // deadline.
    clock: Maybe[{ pending: Pending, frame: bool }],
    // The step whose cutouts the innermost scrim holds — or, for a step that
    // points at nothing, the step drawn on the document with none. Written by
    // `reveal` and `redraw`, cleared by `destroy`.
    screen: Maybe[str],
    // Whether the message is visible.
    messageUp: bool,
    // Whether anything of the tour is on the page: layers, the way out, the
    // ring. Up from the first draw, down with `destroy`.
    onPage: bool,
    // The morph in flight, by the step it draws. A morph another reveal cuts
    // short, or a teardown halts, resolves unfinished and reports nothing.
    morphing: Maybe[str],
    // The glides running: minted and neither abandoned nor landed. An
    // abandoned glide never settles.
    moving: Set[int],
    // --- the past, which is where a stale report comes from
    // Every glide ever minted and every wait ever begun. A `settled` or an
    // `expired` is offered for any of them, so the plan's defence against a
    // late one is exercised rather than assumed.
    glides: Set[int],
    waits: Set[Pending],
    nextToken: int,
    // --- the world
    // The steps, as {@link STEPS} defines them. Here rather than read off that
    // `pure val` alone so that the table lands in every state of a trace, and
    // `packages/presenter/src/replay.test.ts` builds its fixture out of the trace
    // rather than out of a second copy written by hand. One definition, two
    // readers: everything with a state reads this, and {@link pointsAt} reads
    // `STEPS` because `reduce` is handed no state, the way `plan.ts` reads the
    // step object it was given.
    world: str -> StepSpec,
    // Which targets are on the page. Written by every event that carries a
    // fact about it, so the page always agrees with what the shell last saw.
    page: Set[str],
    // --- reading the last action
    // Which mode the last action found. A witness that wants to know what a
    // `show` left reads this beside `marks`.
    from: str,
    // Which way each `reduce` the last action ran went, outermost first. More
    // than one where an effect came back in: `["mutated-arrive", "arrived-glide"]`
    // is a hunt finding its target and the arrival gliding.
    marks: List[str],
    // What each of those `reduce` calls owed, for the replay's oracle.
    outcomes: List[{ effects: List[Effect], last: Maybe[Reentrant] }],
    // Set where an effect came back into the plan deeper than the interpreter
    // below unrolls. Never, as the plan stands; an invariant says so.
    deep: bool,
  }

  // ------------------------------------------------------------ the bounded world
  //
  // Two steps that point at something and one that waits. The plan compares
  // steps and never targets, so two steps sharing a target would add nothing.

  pure val STEPS: str -> StepSpec = Map(
    "one" -> { id: "one", target: Just("first") },
    "two" -> { id: "two", target: Just("second") },
    // Points at nothing on purpose, and is drawn on the document with no hole.
    "wait" -> { id: "wait", target: Nothing },
  )

  pure val TARGETS = Set("first", "second")

  /// The one reason a guard ever gives here. Which words are told is not the
  /// question; that they are held and where they are said is.
  pure val REASON = "no"

  pure val KNOBS: Set[Knobs] =
    Bool.map((somewhere) =>
      Bool.map((measured) =>
        Bool.map((outright) => { somewhere: somewhere, measured: measured, outright: outright })
      ).flatten()
    ).flatten()

  /// For an action that turns none of them.
  pure val NO_KNOBS: Knobs = { somewhere: false, measured: true, outright: true }

  // ------------------------------------------------------------------ reading

  var m: M

  /// `pointsAt` in plan.ts.
  pure def pointsAt(step: str): bool = STEPS.get(step).target != Nothing

  pure def kindOf(mode: Mode): str =
    match mode {
      | Idle => "idle"
      | Drawn(_) => "drawn"
      | Retrying(_) => "retrying"
      | Deferred(_) => "deferred"
      | Gliding(_) => "gliding"
    }

  // ------------------------------------------------------------------ the plan
  //
  // `reduce` and the three moves it is written from, in the order plan.ts has
  // them. `fresh` is the identity plan.ts gets from `{}` for free: the token a
  // `Pending` minted in this call is to carry.

  pure def nothing(mode: Mode, mark: str): Outcome =
    { mode: mode, effects: [], last: Nothing, mark: mark }

  /// `leaving` in plan.ts.
  pure def leaving(mode: Mode): List[Effect] =
    match mode {
      | Gliding(g) => [Abandon(g.glide)]
      | Retrying(_) => [Cancel]
      | Deferred(_) => [Cancel]
      | _ => []
    }

  /// `standingIn` in plan.ts.
  pure def standingIn(mode: Mode): Maybe[Picture] =
    match mode {
      | Idle => Nothing
      | Drawn(d) => Just(d)
      | Retrying(r) => r.standing
      | Deferred(d) => d.standing
      | Gliding(g) => g.standing
    }

  /// `retrying` in plan.ts.
  pure def retrying(
    pending: Pending, error: Maybe[str], standing: Maybe[Picture], before: List[Effect],
    unmeasured: bool, mark: str
  ): Outcome = {
    mode: Retrying({ pending: pending, unmeasured: unmeasured, error: error, standing: standing }),
    effects: before.concat([Hunt({ step: pending.step }), Deadline(pending)]),
    last: Nothing,
    mark: mark,
  }

  /// `revealing` in plan.ts.
  pure def revealing(
    drawn: Picture, anchor: bool, animate: bool, before: List[Effect], mark: str
  ): Outcome = {
    mode: Drawn(drawn),
    effects: before.concat([Disarm]),
    last: Just(Reveal({ drawn: drawn, anchor: anchor, animate: animate })),
    mark: mark,
  }

  /// `reduce` in plan.ts, case for case. The marks name the branch taken, and
  /// every branch has one.
  pure def reduce(mode: Mode, event: Event, fresh: int): Outcome =
    match event {
      // --- what the machine calls

      // Whatever the step points at: it is looked for on the frame.
      | Show(e) => {
        val pending = { step: e.step, animate: e.animate, token: fresh }
        {
          mode: Deferred({ pending: pending, error: Nothing, standing: standingIn(mode) }),
          effects: leaving(mode).concat([Hide, Disarm, Defer(pending)]),
          last: Nothing,
          mark: "show-defer",
        }
      }

      // The step the event names is not compared, here as in plan.ts: the
      // reason goes on whatever mode stands. A retell about another step is a
      // machine standing somewhere the presenter was not told about, and the
      // loose machine here can make one.
      | Retell(e) =>
        match mode {
          | Idle => nothing(mode, "retell-idle")
          | Drawn(d) => {
            mode: Drawn(d.with("error", Just(e.reason))),
            effects: [Reword({ step: e.step, reason: e.reason })],
            last: Nothing,
            mark: "retell-said",
          }
          | Retrying(r) => nothing(Retrying(r.with("error", Just(e.reason))), "retell-held")
          | Deferred(d) => nothing(Deferred(d.with("error", Just(e.reason))), "retell-held")
          | Gliding(g) => nothing(Gliding(g.with("error", Just(e.reason))), "retell-held")
        }

      | Teardown =>
        { mode: Idle, effects: leaving(mode).concat([Disarm, Destroy]), last: Nothing, mark: "teardown" }

      // --- what the page answers

      | Arrived(e) => {
        val before = leaving(mode)
        val pending = { step: e.step, animate: e.animate, token: fresh }
        match e.glide {
          | Just(g) => {
            mode: Gliding({ glide: g, pending: pending, error: e.error, standing: standingIn(mode) }),
            effects: before.concat([Hide, Disarm]),
            last: Nothing,
            mark: "arrived-glide",
          }
          | Nothing => revealing({ step: e.step, error: e.error }, e.anchor, e.animate, before, "arrived-draw")
        }
      }

      | Settled(e) =>
        match mode {
          | Gliding(g) =>
            if (g.glide != e.glide) nothing(mode, "settled-stale")
            else if (not(e.anchor)) retrying(g.pending, g.error, g.standing, [], false, "settled-retry")
            else revealing({ step: g.pending.step, error: g.error }, true, g.pending.animate, [], "settled-draw")
          | _ => nothing(mode, "settled-stale")
        }

      | Morphed(e) =>
        match mode {
          | Drawn(d) =>
            if (d.step != e.step) nothing(mode, "morphed-stale")
            else { mode: mode, effects: [Say(d)], last: Nothing, mark: "morphed-said" }
          | _ => nothing(mode, "morphed-stale")
        }

      | Mutated(e) =>
        match mode {
          | Retrying(r) =>
            // One condition in `plan.ts` and two marks here, the way `advance`
            // in `machine.qnt` tells `refuse-said` from `refuse-mute`: a batch
            // about a step the hunt is not looking for and a batch that found
            // nothing are the two halves worth aiming at.
            if (r.pending.step != e.step) nothing(mode, "mutated-elsewhere")
            else if (not(e.found)) nothing(mode, "mutated-ignored")
            else {
              mode: mode,
              effects: [],
              last: Just(Arrive({ pending: r.pending, error: r.error })),
              mark: "mutated-arrive",
            }
          // A hunt is armed in `retrying` and nowhere else, so this arm is
          // unreachable in the model: `doMutated` needs the observer on, and
          // the observer is only ever on here. It is the same last line of
          // defence the guard in `plan.ts` is, against a batch from an
          // observer already disconnected, and it carries no witness for the
          // same reason.
          | _ => nothing(mode, "mutated-unarmed")
        }

      | Unmeasured(e) =>
        match mode {
          | Drawn(d) =>
            if (d.step != e.step) nothing(mode, "unmeasured-ignored")
            else retrying({ step: d.step, animate: e.animate, token: fresh },
                          d.error, Nothing, [], true, "unmeasured-retry")
          | _ => nothing(mode, "unmeasured-ignored")
        }

      | Expired(e) =>
        match mode {
          | Retrying(r) =>
            if (r.pending != e.pending) nothing(mode, "expired-stale")
            // Asked once more before giving up: the deadline bounds the wait
            // rather than having the last word on it, because a target can
            // turn up without the hunt's observer hearing anything.
            else if (e.found and not(r.unmeasured)) {
              mode: mode,
              effects: [],
              last: Just(Arrive({ pending: r.pending, error: r.error })),
              mark: "expired-arrive",
            }
            // The wait a draw began, which resolving cannot end: the anchor
            // resolved in the same task that could not measure it, so an
            // arrival here would fail the same way and arm another deadline.
            else if (e.found) {
              mode: Idle,
              effects: [Disarm],
              last: Just(Lost({ step: r.pending.step })),
              mark: "expired-unmeasured",
            }
            else {
              mode: Idle,
              effects: [Disarm],
              last: Just(Lost({ step: r.pending.step })),
              mark: "expired-lost",
            }
          // The frame after a hand-over: the first look for the target.
          | Deferred(d) =>
            if (d.pending != e.pending) nothing(mode, "expired-stale")
            else if (not(pointsAt(d.pending.step)))
              revealing({ step: d.pending.step, error: d.error }, false, d.pending.animate, [], "framed-draw")
            else if (e.found) {
              mode: mode,
              effects: [],
              last: Just(Arrive({ pending: d.pending, error: d.error })),
              mark: "framed-arrive",
            }
            else retrying(d.pending, d.error, d.standing, [], false, "framed-retry")
          | _ => nothing(mode, "expired-stale")
        }

      | Resized =>
        match mode {
          | Drawn(d) =>
            { mode: mode, effects: [], last: Just(Replace({ drawn: d, saying: true })), mark: "resized-said" }
          // A step on its way, or nothing at all: what stands goes back
          // without its words, where anything stands.
          | _ =>
            match standingIn(mode) {
              | Nothing => nothing(mode, "resized-nothing")
              | Just(d) =>
                { mode: mode, effects: [], last: Just(Replace({ drawn: d, saying: false })), mark: "resized-holes" }
            }
        }

      // The page has answered where the step a resize is putting back is, and
      // the answer decides which of the two the resize owes. The mode does not
      // move: a resize is the surface moving under the tour.
      | Resolved(e) =>
        if (not(e.found) and pointsAt(e.drawn.step))
          { mode: mode, effects: [Refit(e.drawn)], last: Nothing, mark: "resolved-refit" }
        else
          { mode: mode, effects: [Redraw({ drawn: e.drawn, found: e.found, saying: e.saying })],
            last: Nothing, mark: "resolved-redraw" }
    }

  // ----------------------------------------------------------------- the shell
  //
  // `perform` in presenter.ts, as what each effect does to the implicit state:
  // {@link perform} for an `Effect`, {@link reenter} for a `Reentrant`.

  pure def mint(s: M): M = s.with("nextToken", s.nextToken + 1)

  /// A glide begun, by the shell, before the `arrived` that carries it.
  pure def glideFrom(s: M): { s: M, glide: int } = {
    val g = s.nextToken
    { s: mint(s).with("moving", s.moving.union(Set(g))).with("glides", s.glides.union(Set(g))), glide: g }
  }

  /// The page after the shell saw `step`'s target resolve or not. A step that
  /// points at nothing has nothing to write.
  pure def saw(s: M, step: str, present: bool): M =
    match s.world.get(step).target {
      | Nothing => s
      | Just(t) => s.with("page", if (present) s.page.union(Set(t)) else s.page.exclude(Set(t)))
    }

  /// The machine's `teardown`, as the event it dispatches. A function of the
  /// state rather than the constant it is, because Quint infers one effect for
  /// every argument a lambda parameter is ever handed, and a constant here
  /// would have `again` refuse the state-reading events everywhere else.
  pure def teardownIn(s: M): Event = if (s.deep) Teardown else Teardown

  pure def perform(s: M, e: Effect): M =
    match e {
      | Abandon(g) => s.with("moving", s.moving.exclude(Set(g)))
      | Hide => s.with("messageUp", false)
      | Disarm => s.with("watcher", Off)
      | Hunt(h) => s.with("watcher", Hunting(h.step))
      // `cancel()` then `setTimeout` or `requestAnimationFrame`, so there is
      // never a second one.
      | Deadline(p) => s.with("clock", Just({ pending: p, frame: false }))
      | Defer(p) => s.with("clock", Just({ pending: p, frame: true }))
      | Cancel => s.with("clock", Nothing)
      // The layers standing are sized to the surface again and the way out is
      // placed: nothing is cut and nothing is said, so nothing the model keeps
      // moves.
      | Refit(_) => s
      | Redraw(r) => {
        // `set`, which halts a morph in flight: it settles unfinished and
        // reports nothing. `measure` failing after the anchor resolved is the
        // same unreachable exit `reveal` has, and this arm takes it that
        // measuring succeeds; `README.md` says so beside `unmeasured`.
        val holes = s.with("screen", Just(r.drawn.step)).with("morphing", Nothing)
        if (r.saying) holes.with("messageUp", true) else holes
      }
      // Every step in the world has words, so `say` always shows the box.
      | Say(_) => s.with("messageUp", true).with("onPage", true)
      // `retold`: a visible message changes its words, a hidden one is said.
      | Reword(_) => s.with("messageUp", true)
      | Destroy =>
        s.with("onPage", false)
         .with("screen", Nothing)
         .with("messageUp", false)
         .with("morphing", Nothing)
    }

  /// The four that come back in — `reveal` reports `unmeasured` or `morphed`
  /// from inside itself, `replace` reports `resolved`, `arrive` is an `arrived`,
  /// `lost` is a teardown from inside the machine's call — and `again` is how.
  /// Quint has no recursion, so {@link dispatch} unrolls it as deep as the plan
  /// nests, and the next level marks the state `deep` instead of running.
  pure def reenter(s: M, e: Reentrant, k: Knobs, again: (M, Event) => M): M =
    match e {
      | Reveal(r) => {
        // The words of the step being left go, and `measure` restacks the
        // layers whatever it finds, so something of the tour is on the page
        // from here on either way.
        val up = s.with("messageUp", false).with("onPage", true)
        if (not(k.measured))
          // Nothing was drawn. The plan takes it that the stack may have been
          // rebuilt on the way to finding nothing, and so does this: what
          // stands is not known, and a rebuilt stack halts the morph.
          again(up.with("screen", Nothing).with("morphing", Nothing),
                Unmeasured({ step: r.drawn.step, animate: r.animate }))
        else {
          // `place`, then the morph. Applied outright, `morphed` comes back
          // from inside the same call; animated, it is a promise the page
          // holds, and {@link doMorphed} is it landing.
          val placed = up.with("screen", Just(r.drawn.step))
          if (k.outright) again(placed.with("morphing", Nothing), Morphed({ step: r.drawn.step }))
          else placed.with("morphing", Just(r.drawn.step))
        }
      }
      // `perform`'s `replace` in presenter.ts: the page is asked where the step
      // is and answers as data. The one place the page is read here, which is
      // the same question the frame after a hand-over asks.
      | Replace(r) =>
        again(s, Resolved({
          drawn: r.drawn, saying: r.saying,
          found: match s.world.get(r.drawn.step).target {
            | Nothing => false
            | Just(t) => s.page.contains(t)
          },
        }))
      | Arrive(a) => {
        // `arrive` in presenter.ts: the one place a scroll happens. A glide is
        // minted where `bringIntoView` had somewhere to go, and the `arrived`
        // carries it.
        if (k.somewhere) {
          val begun = glideFrom(s)
          again(begun.s, Arrived({
            step: a.pending.step, anchor: true, animate: a.pending.animate,
            glide: Just(begun.glide), error: a.error,
          }))
        } else
          again(s, Arrived({
            step: a.pending.step, anchor: true, animate: a.pending.animate,
            glide: Nothing, error: a.error,
          }))
      }
      // `Host.lost`. The machine is standing on the step the presenter was
      // last shown — every move it makes comes here as a `show` or a
      // `teardown` first — so it ends the run, and the teardown arrives from
      // inside the call.
      | Lost(_) => again(s, teardownIn(s))
    }

  /// `dispatch` in presenter.ts: the mode is written before any effect runs,
  /// the effects run in order against whatever state the ones before them
  /// left, and `last` comes back in once they have.
  pure def dispatchWith(s: M, ev: Event, k: Knobs, again: (M, Event) => M): M = {
    val fresh = s.nextToken
    val o = reduce(s.mode, ev, fresh)
    // A `Pending` minted in this call begins a wait, and a wait once begun can
    // be reported on for ever.
    val begun = match o.mode {
      | Retrying(r) => if (r.pending.token == fresh) Set(r.pending) else Set()
      | Deferred(d) => if (d.pending.token == fresh) Set(d.pending) else Set()
      | Gliding(g) => if (g.pending.token == fresh) Set(g.pending) else Set()
      | _ => Set()
    }
    val committed = mint(s)
      .with("mode", o.mode)
      .with("waits", s.waits.union(begun))
      .with("marks", s.marks.append(o.mark))
      .with("outcomes", s.outcomes.append({ effects: o.effects, last: o.last }))
    val done = o.effects.foldl(committed, (t, e) => perform(t, e))
    match o.last {
      | Just(r) => reenter(done, r, k, again)
      | Nothing => done
    }
  }

  /// The third level, and the last: an effect of its outcome that came back in
  /// would be a fourth, and marks the state `deep` instead of running.
  pure def dispatch3(s: M, ev: Event, k: Knobs): M =
    dispatchWith(s, ev, k, (t, _) => t.with("deep", true))
  pure def dispatch2(s: M, ev: Event, k: Knobs): M =
    dispatchWith(s, ev, k, (t, e) => dispatch3(t, e, k))

  /// Three deep, which is as deep as the plan nests: a clock or a hunt
  /// finding its target is an `arrive`, the `arrived` it makes is a `reveal`,
  /// and the `reveal` reports `unmeasured` or `morphed`. Whatever those owe comes back in no
  /// further, and a fourth level is {@link boundedReentry} failing.
  pure def dispatch(s: M, ev: Event, k: Knobs): M =
    dispatchWith(s, ev, k, (t, e) => dispatch2(t, e, k))

  /// The start of an action: what the last one left is read off and cleared.
  pure def begin(s: M): M =
    s.with("from", kindOf(s.mode)).with("marks", []).with("outcomes", [])

  // ---------------------------------------------------------------- the events
  //
  // One action per `Event`. The first three are the machine's, offered in
  // every mode; the rest are the page answering something the shell armed or
  // asked, and each is offered exactly where the shell would hear it.

  /// `Presenter.show`. Nothing is looked for: the step is resolved on the
  /// frame, which is {@link doExpired}.
  action doShow(step: str, animate: bool): bool = all {
    m' = dispatch(begin(m), Show({ step: step, animate: animate }), NO_KNOBS),
  }

  /// `Presenter.retell`, about any step, in any mode.
  action doRetell(step: str): bool = all {
    m' = dispatch(begin(m), Retell({ step: step, reason: REASON }), NO_KNOBS),
  }

  /// `Presenter.teardown`, in any mode.
  action doTeardown: bool = all {
    m' = dispatch(begin(m), Teardown, NO_KNOBS),
  }

  /// A glide's `settled` promise resolving. For the glide the mode holds, that
  /// is the page landing, and `found` is the pending step's target resolved
  /// again where it stopped. For any other glide ever minted it is stale —
  /// unreachable in a browser, where an abandoned glide never settles and a
  /// landed one settled once — and offered so the plan's comparison is
  /// exercised rather than assumed.
  action doSettled(g: int, found: bool, k: Knobs): bool = all {
    m.glides.contains(g),
    m' = {
      val s = begin(m)
      match s.mode {
        | Gliding(x) =>
          if (x.glide == g)
            dispatch(saw(s, x.pending.step, found).with("moving", s.moving.exclude(Set(g))),
                     Settled({ glide: g, anchor: found }), k)
          else dispatch(s, Settled({ glide: g, anchor: found }), k)
        | _ => dispatch(s, Settled({ glide: g, anchor: found }), k)
      }
    },
  }

  /// The morph in flight getting to its end. Only the one in flight: a morph
  /// cut short by the next one, or halted by a teardown, resolves unfinished
  /// and the shell reports nothing for it.
  action doMorphed: bool = all {
    m.morphing != Nothing,
    m' =
      match m.morphing {
        | Just(step) => dispatch(begin(m).with("morphing", Nothing), Morphed({ step: step }), NO_KNOBS)
        | Nothing => m
      },
  }

  /// The observer firing. Offered while it is armed, about any step, and
  /// `found` is what resolving that step turned up, written to the page. In
  /// the browser the batch is always about the step the observer was armed
  /// for; the plan compares all the same, and this is where that is asked.
  action doMutated(step: str, found: bool, k: Knobs): bool = all {
    m.watcher != Off,
    m' = dispatch(saw(begin(m), step, found), Mutated({ step: step, found: found and pointsAt(step) }), k),
  }

  /// A clock running out — a hand-over's frame or a retry's deadline — for
  /// any wait ever begun. For the one armed it is the frame or the retry
  /// running out; for any other it is stale, and offered for the reason
  /// {@link doSettled} offers one. `found` is what the shell resolved as the
  /// clock ran out, written to the page the way a `mutated` writes it, and
  /// false for a step that points at nothing.
  ///
  /// Knobs, because a clock that finds its target arrives, and an arrival is
  /// where a glide begins: the same reason {@link doMutated} carries them.
  action doExpired(p: Pending, found: bool, k: Knobs): bool = all {
    m.waits.contains(p),
    m' = {
      val s = begin(m)
      val e = Expired({ pending: p, found: found and pointsAt(p.step) })
      // What it resolved is written to the page only for the clock actually
      // running, the way {@link doSettled} writes a landing only for the glide
      // the mode holds: a stale one is answered with nothing, so what it saw
      // is nothing the page has to agree with.
      val armed = match s.clock {
        | Just(c) => c.pending == p
        | Nothing => false
      }
      if (armed) dispatch(saw(s, p.step, found).with("clock", Nothing), e, k)
      else dispatch(s, e, k)
    },
  }

  /// The window resizing, in any mode.
  action doResized: bool = all {
    m' = dispatch(begin(m), Resized, NO_KNOBS),
  }

  // ------------------------------------------------------------------ stepping

  pure val FRESH: M = {
    mode: Idle,
    watcher: Off,
    clock: Nothing,
    screen: Nothing,
    messageUp: false,
    onPage: false,
    morphing: Nothing,
    moving: Set(),
    glides: Set(),
    waits: Set(),
    nextToken: 0,
    world: STEPS,
    page: TARGETS,
    from: "idle",
    marks: [],
    outcomes: [],
    deep: false,
  }

  action init = all {
    m' = FRESH,
  }

  action step = any {
    nondet showStep = STEPS.keys().oneOf()
    nondet animate = Bool.oneOf()
    doShow(showStep, animate),
    nondet retellStep = STEPS.keys().oneOf()
    doRetell(retellStep),
    doTeardown,
    nondet glidePick = m.glides.oneOf()
    nondet landedOn = Bool.oneOf()
    nondet settleKnobs = KNOBS.oneOf()
    doSettled(glidePick, landedOn, settleKnobs),
    doMorphed,
    nondet mutatedStep = STEPS.keys().oneOf()
    nondet found = Bool.oneOf()
    nondet mutateKnobs = KNOBS.oneOf()
    doMutated(mutatedStep, found, mutateKnobs),
    nondet waitPick = m.waits.oneOf()
    nondet expiredFound = Bool.oneOf()
    nondet expireKnobs = KNOBS.oneOf()
    doExpired(waitPick, expiredFound, expireKnobs),
    doResized,
  }

  // ---------------------------------------------------------------- invariants
  //
  // The sentences that were prose on the old presenter are the `Mode` type
  // now, so what is left to hold is the mode against what the shell keeps
  // implicitly.

  /// What is on the page is what the mode says is. `idle` has nothing there,
  /// `drawn` has its step, and every mode with a step on its way has
  /// `standing` — nothing is drawn for a retry, for the frame or for the gap,
  /// and putting back what was drawn is not drawing. The finding this would have caught: a glide
  /// begun from a retry carrying no `standing`, so a resize during it put
  /// nothing back.
  val screenIsTheModes: bool =
    match m.mode {
      | Idle => m.screen == Nothing
      | Drawn(d) => m.screen == Just(d.step)
      | Retrying(r) =>
        match r.standing {
          | Nothing => m.screen == Nothing
          | Just(d) => m.screen == Just(d.step)
        }
      | Deferred(w) =>
        match w.standing {
          | Nothing => m.screen == Nothing
          | Just(d) => m.screen == Just(d.step)
        }
      | Gliding(g) =>
        match g.standing {
          | Nothing => m.screen == Nothing
          | Just(d) => m.screen == Just(d.step)
        }
    }

  /// A deadline is armed exactly while the mode is `retrying`, and a frame
  /// exactly while it is `deferred`, each for the `pending` the mode holds; the
  /// observer hunts in `retrying`, for that same step, and is off in every
  /// other mode. A step on screen arms nothing.
  val armedIsTheModes: bool =
    match m.mode {
      | Idle => m.clock == Nothing and m.watcher == Off
      | Drawn(_) => m.clock == Nothing and m.watcher == Off
      | Retrying(r) =>
        m.clock == Just({ pending: r.pending, frame: false }) and m.watcher == Hunting(r.pending.step)
      | Deferred(d) => m.clock == Just({ pending: d.pending, frame: true }) and m.watcher == Off
      | Gliding(_) => m.clock == Nothing and m.watcher == Off
    }

  /// `deferred` implies the message is hidden: the words of the step being
  /// left go at the call, so a press on its next control cannot reach a step
  /// the viewer has not seen.
  val deferredIsBare: bool =
    match m.mode {
      | Deferred(_) => not(m.messageUp)
      | _ => true
    }

  /// `gliding` implies the message is hidden — nothing is drawn for the gap —
  /// and the glide the mode holds is the only one moving the page. A glide
  /// nobody is waiting for must not go on carrying the page to somewhere the
  /// tour no longer is.
  val glidingIsBare: bool =
    match m.mode {
      | Gliding(g) => not(m.messageUp) and m.moving == Set(g.glide)
      | _ => m.moving == Set()
    }

  /// `idle` implies nothing is left: nothing on the page, no words, no morph.
  /// The clock, the watcher and the glide are {@link armedIsTheModes} and
  /// {@link glidingIsBare}'s. A tour that has been stopped must not draw
  /// itself back onto the page 100ms later.
  val idleIsClean: bool =
    match m.mode {
      | Idle => not(m.onPage) and not(m.messageUp) and m.screen == Nothing and m.morphing == Nothing
      | _ => true
    }

  /// The step table never changes. It is in the state so that it reaches a
  /// trace and `packages/presenter/src/replay.test.ts` can build its fixture from
  /// one, and being in the state is what makes that worth saying out loud:
  /// `pointsAt` reads {@link STEPS} directly, because `reduce` is handed no
  /// state, so anything that wrote `world` would leave the two disagreeing and
  /// every trace harvested afterwards would carry the disagreement.
  val worldIsFixed: bool = m.world == STEPS

  /// Nothing came back in deeper than {@link dispatch} unrolls. A plan that
  /// nests further wants another level, not a quieter model.
  val boundedReentry: bool = not(m.deep)

  // ----------------------------------------------------------------- witnesses
  //
  // Not properties. Each is a state the model was written to reach, and a run
  // reporting 0 for one of them is a model whose actions have stopped
  // describing the code. `pnpm model` passes them to `quint run --witnesses`
  // and fails on a zero. One per mark a trace can reach, and a few for the pair
  // of a mark and the mode it was made in. `unmeasured-ignored` is the one mark
  // with no witness: `unmeasured` only ever arrives from inside `reveal`,
  // against the `drawn` that reveal just committed, so the guard in `plan.ts`
  // it mirrors is exercised by nothing and a witness for it would sit at zero.

  pure def went(s: M, mark: str): bool = s.marks.indices().exists((i) => s.marks[i] == mark)

  /// The outermost mark of the last action, or none before the first.
  pure def first(s: M): str = if (s.marks.length() == 0) "" else s.marks[0]

  // --- one per branch of `reduce` a trace can reach

  val showDefer: bool = went(m, "show-defer")
  val framedDraw: bool = went(m, "framed-draw")
  val framedRetry: bool = went(m, "framed-retry")
  val framedArrive: bool = went(m, "framed-arrive")
  val arrivedDraw: bool = went(m, "arrived-draw")
  val arrivedGlide: bool = went(m, "arrived-glide")
  val retellSaid: bool = went(m, "retell-said")
  val retellHeld: bool = went(m, "retell-held")
  val retellIdle: bool = went(m, "retell-idle")
  val tornDown: bool = went(m, "teardown")
  val settledDraw: bool = went(m, "settled-draw")
  val settledRetry: bool = went(m, "settled-retry")
  val settledStale: bool = went(m, "settled-stale")
  val morphedSaid: bool = went(m, "morphed-said")
  /// A morph that outlived the mode it was drawing for: the target left the
  /// page mid-morph, or the tour glided on, and the morph landed anyway.
  val morphedStale: bool = went(m, "morphed-stale")
  val mutatedArrive: bool = went(m, "mutated-arrive")
  val mutatedIgnored: bool = went(m, "mutated-ignored")

  /// A batch about a step the hunt is not looking for. The plan turns it down,
  /// and `packages/presenter/src/replay.test.ts` is what caught a plan that took it:
  /// `plan.test.ts` had no example for a hunt hearing about another step.
  val mutatedElsewhere: bool = went(m, "mutated-elsewhere")
  val unmeasuredRetry: bool = went(m, "unmeasured-retry")
  val expiredArrive: bool = went(m, "expired-arrive")
  /// A deadline that found its target and gave it up all the same, because the
  /// wait was one a draw began. The branch that keeps the retry from arming
  /// itself for ever at 100ms a turn.
  val expiredUnmeasured: bool = went(m, "expired-unmeasured")
  val expiredLost: bool = went(m, "expired-lost")
  val expiredStale: bool = went(m, "expired-stale")
  val resizedSaid: bool = went(m, "resized-said")
  val resizedHoles: bool = went(m, "resized-holes")
  val resizedNothing: bool = went(m, "resized-nothing")
  val resolvedRedraw: bool = went(m, "resolved-redraw")
  val resolvedRefit: bool = went(m, "resolved-refit")

  // --- a mark and the mode it landed in: the entrances the review of the first
  // --- plan found unenumerated, and the others of that class

  /// A glide begun from a retry, either way one can be: a hunt finding its
  /// target and the arrival scrolling, or the deadline finding it. Its
  /// `standing` is inherited, and {@link screenIsTheModes} checks it.
  val glideFromRetry: bool =
    m.from == "retrying" and (
      m.marks == ["mutated-arrive", "arrived-glide"] or m.marks == ["expired-arrive", "arrived-glide"]
    )

  /// A glide begun on the frame after a hand-over, which inherits what the
  /// hand-over kept standing.
  val glideFromDeferred: bool = m.from == "deferred" and m.marks == ["framed-arrive", "arrived-glide"]

  /// The same, with a step standing behind the glide, so what it inherited is
  /// a step rather than nothing.
  ///
  /// `packages/presenter/src/replay.test.ts` is why this is separate from the one
  /// above. A glide begun from a retry that had nothing standing looks exactly
  /// like one that inherited nothing at all, so a corpus that only reached
  /// that one replayed green against a plan which dropped `standing` on the
  /// way. This is the state that tells the two apart.
  val glideOverStanding: bool =
    (glideFromRetry or glideFromDeferred) and (match m.mode {
      | Gliding(g) => g.standing != Nothing
      | _ => false
    })

  /// A resize while the page glides, with a step standing to put back.
  val resizedInGlide: bool = went(m, "resized-holes") and kindOf(m.mode) == "gliding"

  /// A resize while a retry hunts, with a step standing to put back.
  val resizedInRetry: bool = went(m, "resized-holes") and kindOf(m.mode) == "retrying"

  /// A resize while a step waits for its frame, with a step standing to put
  /// back without its words.
  val resizedInDeferred: bool = went(m, "resized-holes") and kindOf(m.mode) == "deferred"

  /// A `retell` arriving in `retrying`: the entrance the first plan had not
  /// enumerated. The reason is stored on the mode and nothing is said.
  val retellInRetry: bool = went(m, "retell-held") and kindOf(m.mode) == "retrying"

  /// The same arriving mid-glide, where the reason waits for the landing.
  val retellInGlide: bool = went(m, "retell-held") and kindOf(m.mode) == "gliding"

  /// The same arriving before the frame, where the reason waits for the draw.
  val retellInDeferred: bool = went(m, "retell-held") and kindOf(m.mode) == "deferred"

  /// A `settled` landing with the reason a guard told mid-glide, so the words
  /// drawn are the mode's and not the arrival's.
  val landedWithReason: bool =
    went(m, "settled-draw") and (match m.mode {
      | Drawn(d) => d.error != Nothing
      | _ => false
    })

  // --- what a teardown had to stop

  val teardownFromGlide: bool = went(m, "teardown") and m.from == "gliding"
  val teardownFromRetry: bool = went(m, "teardown") and m.from == "retrying"
  /// A teardown before the frame, which stops it: a stopped tour draws nothing
  /// on it.
  val teardownFromDeferred: bool = went(m, "teardown") and m.from == "deferred"

  // --- an arrival landing on a wait already running

  /// A `show` over a retry, which cancels the deadline it leaves and takes
  /// the hunt off; a target that turns up late for it must find nobody
  /// hunting.
  val showOverRetry: bool = m.from == "retrying" and first(m) == "show-defer"

  /// A `show` over a glide, which abandons it: a page on its way to a step the
  /// tour has left must not carry on under this one.
  val showOverGlide: bool = m.from == "gliding" and first(m) == "show-defer"

  /// A `show` over a step still waiting for its frame, which stops that frame:
  /// the step overtaken is never drawn.
  val showOverDeferred: bool = m.from == "deferred" and first(m) == "show-defer"

  /// A frame left over from a hand-over that ended, landing on the one that
  /// replaced it, and answered with nothing.
  val expiredStaleInDeferred: bool = went(m, "expired-stale") and kindOf(m.mode) == "deferred"

  /// A step that points at nothing, drawn on the document with no hole and
  /// nothing watched.
  val waitDrawn: bool =
    match m.mode {
      | Drawn(d) => d.step == "wait"
      | _ => false
    }
}
