# Contributing

Thanks for looking. Leko is pre-release, so the API still moves; issues that
report a broken assumption are as useful as pull requests.

This file is the commands and the rules. [ONBOARDING.md](ONBOARDING.md) is the
code: which file to open first, what each package is for, and one trace
from a `reached()` call to the pixels it moves. Read it before your first
change.

## Getting set up

Node is pinned in `.node-version`, which mise, fnm, nvm, asdf and volta all
read — use whichever you already have, or install that version by hand. pnpm is
pinned in `package.json`; `corepack enable` picks it up, or install pnpm 10
yourself.

```bash
pnpm install
pnpm exec playwright install chromium firefox webkit   # once
pnpm test
```

The Playwright step is not optional. The suite runs in real browsers and there
is no fallback — [DESIGN.md](DESIGN.md#how-to-write-here-and-where-tests-go) says why
jsdom cannot stand in.

## Seeing it run

```bash
pnpm dev
```

That serves [`examples/sandbox/`](examples/sandbox/), which resolves the core
from source rather than from a build, so there is no watch process to keep alive
and no way to end up debugging a stale `dist/`.

`packages/codegen` is built first, because a Vite config is loaded by Node and
Node does not read the `development` export condition. The sandbox runs the
generator as a Vite plugin, so `src/leko-signals.d.ts` is rewritten from the
`reached()` calls while the server runs. That file is committed, and CI builds
and then runs `git diff --exit-code` to catch one that has fallen behind.

The sandbox is not a showcase. Every case is something a user *does* — typing,
waiting for a request, scrolling a panel — because a demo where the user only
watches proves nothing about a library whose whole claim is that they do not.
Behaviour a user would notice wants a case there, and each case says in one
sentence what it proves.

## The documentation site

[`docs/`](docs/) is the site, built with Astro and Starlight as the workspace
package `@leko-docs/site`.

```bash
pnpm --filter @leko-docs/site dev
```

It takes `@annetaan/leko` from the workspace: `astro dev` reads the source
through the `development` export condition, and a build reads `dist/`. The
stylesheet is exported from `dist/` alone, so build `packages/leko` before the
first `dev`, and again after changing `leko.css`: the running site keeps the
copy in `dist/` while the TypeScript it reads is the source.

`pnpm build` builds the site after the packages it depends on, `pnpm typecheck`
runs `astro check` in it, and `pnpm check:links` reads the pages the build left
in `docs/dist` and fails on an internal link that does not land.
[`docs/src/lib/href.ts`](docs/src/lib/href.ts) says which link is the one that
goes wrong.

Every pull request's CI run carries an artifact named `docs-site`, which is the
`docs/dist` that run built. Download it from the run's summary page and unzip it
into an empty `docs/dist`, or let `gh` do both. Empty it either way: unzipping
over a local build keeps every page the pull request removed, and `gh` refuses
to write a file that is already there.

```bash
rm -rf docs/dist
gh run download <run-id> -n docs-site -D docs/dist
pnpm --filter @leko-docs/site preview
```

Use `preview` rather than any static server. The site is built for the `/leko`
base, and `astro preview` serves it under that base, so its links land. Served
from the root, every one of them misses.

The site is not published anywhere yet. Publishing waits for the release.

## Commands

```bash
pnpm dev             # the sandbox, resolving the core from source
pnpm typecheck       # tsc --noEmit across workspace packages, and the type tests
pnpm lint            # oxlint
pnpm format          # oxfmt --write
pnpm format:check    # oxfmt --check, which is what CI runs
pnpm check:pack      # what a published package would import, and whether it could
pnpm check:citations # whether every citation of a heading can be read and lands, by name or link
pnpm check:links     # whether every internal link in the built site lands, after pnpm build
pnpm test            # vitest: eight projects, three of them in browsers
pnpm model           # search the Quint models of the machine and the plan for a broken invariant
pnpm model:traces    # regenerate the traces those searches replay against
```

`pnpm model` walks two Quint models, looking for a state that breaks one of
their invariants. [`packages/machine/model/machine.qnt`](packages/machine/model/machine.qnt)
is the machine's `plan.ts` written down as a state machine; the traces it finds
are committed and replayed against the real class by
`packages/machine/src/replay.test.ts`. [`packages/presenter/model/plan.qnt`](packages/presenter/model/plan.qnt)
is the presenter's `plan.ts` written down the same way, with what the shell keeps
implicitly said out loud so the invariants can read it. Together they take
twenty to forty seconds depending on the machine, need no JVM, and run in CI. The seeds are fresh every run, so a
failure there will not reproduce from the workflow file. The run prints the seed
that found it, and `pnpm model --seed=0x…` replays that one sample with its
trace. [`packages/machine/model/README.md`](packages/machine/model/README.md)
and [`packages/presenter/model/README.md`](packages/presenter/model/README.md) say what
each model covers and what it does not.

`pnpm model:traces` regenerates both corpora. Each trace is harvested by handing
`quint run` the negation of a target as its invariant, so every one of them
arrives somewhere worth arriving, and each is then replayed against the real
code — `packages/machine/src/replay.test.ts` drives a real `Machine` over a fake
presenter, and `packages/presenter/src/replay.test.ts` drives the real `reduce`
over fake effects. The seeds are fixed so a diff means something. They are not
portable across Quint versions, which is why regenerating is a command somebody
runs rather than something CI checks.

`pnpm test` runs `spotlight` and `leko` in Chromium, Firefox and WebKit,
`leko-wiring` in Chromium alone, and `presenter`, `machine`, `codegen` and
`scripts` in Node. `presenter` is the presenter's plan twice over:
`plan.test.ts` one `(mode, event)` pair at a time, and `replay.test.ts` over the
corpus the search harvested.
[DESIGN.md](DESIGN.md#how-to-write-here-and-where-tests-go) says what puts a test in
each one. The short version is whether a browser could get the answer wrong.

Markdown is deliberately out of the formatter's reach — prose wrapping is a
judgement call, and `.editorconfig` covers the rest. So are the pages under
`spike/`: one of them is attached to a browser bug report as it stands, and a
formatter should not be rewriting evidence.

**No line numbers in prose.** Point into a file by naming the symbol, the
function or the heading, never `file.ts:147`. Nothing checks a line number and
nothing updates one, so they go stale the first time somebody edits above them
and then send a reader to the wrong place with an air of precision. The same
judgement took the call sites out of the generated `leko-signals.d.ts`: it
carries the names alone, so an edit that moves a line changes nothing in it.

## What `@annetaan/leko` ships

`packages/leko` is the only package here that publishes. `packages/types`,
`packages/machine`, `packages/presenter` and `packages/spotlight` are
`private: true` and stay that way.

That means `packages/leko` cannot import them the way a package normally imports
a dependency. It did, for a while. `tsc` emits one file per source file and
leaves every import specifier alone, so `dist/leko.js` carried an import of
`@annetaan/leko-machine`, and that package is not on the registry.

Nothing reached anyone. `@annetaan/leko@0.0.0` holds the name and contains no
code, so the broken output only ever existed on disk. It would have gone out on
the first real release.

Nothing here could have caught it either. Inside the workspace pnpm links both
packages and everything resolves, so the build passed, the typecheck passed, and
265 tests passed in three browsers. Every check the repository has was asking
about the workspace rather than about the tarball.

So `packages/leko` is built by `tsdown`, which bundles the four into one
`dist/index.js` and one `dist/index.d.ts`. All four are workspace
`devDependencies` now. What a consumer installs is a single package with no
runtime dependencies, which is what `packages/leko` promised in the first place.

`pnpm check:pack` is the check. It reads what `npm pack` would send, finds every
bare import in it, and fails if one names something the manifest does not depend
on. Run it after anything that changes what a package imports or how it is
built.

## Before opening a pull request

```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm format && pnpm check:pack && pnpm check:citations && pnpm check:links && pnpm model && pnpm test
```

CI runs the same nine, with `format:check` in place of `format`.

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org)
— `feat(core):`, `fix(core):`, `docs:`, `test:`, `build:`. Say in the body what
the change makes true that was not true before; the subject is not the place for
it.

## Three things that are not up for negotiation

They are the reasons the library exists, and all three are explained in
[DESIGN.md](DESIGN.md#three-constraints-that-must-not-be-broken):

1. **Nothing is ever layered over the target.** A cutout is a hole, not a
   transparent element. One story is visible at a time because of it.
2. **Steps advance when the host application says so**, never on a DOM event
   Leko observed. It reports what happened — `leko.reached('order-saved')` —
   and the step that declared that name is the one that moves.
3. **Story logic stays in the story.** An application with a tour bolted onto it
   should read the way it read before. Take something out of Leko and the work
   it was doing does not disappear. If what replaces it is a listener in
   application code, one with no job outside the tour and written against a
   particular step, the complexity moved to the host rather than going away.
   `reached()` is the one concession, and it reports that something finished
   without naming a story or a step.

## What looks like an improvement and is not

Each of these has been tried. DESIGN.md argues each one next to the browser
behaviour that settled it, and cites the page under [`spike/`](spike/) you can
open to watch it fail. A pull request that does one of them needs to answer that
page, not just the rule.

- **Blocking with the clipped scrim rather than the `.leko-block` rectangles.**
  A `clip-path` removes an element from hit-testing but not from the search for
  what a wheel should scroll, so a scrollable target stops scrolling under the
  pointer — and `elementFromPoint` reports the hole open the whole time, so no
  hit-testing assertion catches it.
- **Handing the morph to `element.animate()`.** It goes to the compositor, and
  Chrome then rasterises the clip path at the wrong scale on a 2x display.
- **Dropping a subpath when a step needs fewer cutouts.** The two paths stop
  interpolating. Collapse the departing cutout to zero area instead.
- **Reading layout while the user scrolls.** Scroll tracking runs no JavaScript
  at all and must stay that way. A bounded morph writing precomputed strings
  reads nothing and is not the same thing, and nor is the glide reading back
  the one scroll offset it wrote the frame before.
- **Using the browser's smooth scroll for the glide.** An animation Leko did
  not run has to be watched from the outside — a `scrollend` listener, a
  deadline under it, a check that the page has begun to move — and every engine
  wanted a rule of its own. The glide is Leko's own frame loop, the way the
  morph is, so it ends on its own clock and stops when Leko says.
- **Adding a third-party runtime dependency to `packages/leko`.** It has none on
  purpose: a dependency there is a licensing and bundle-size liability for every
  consumer. `@annetaan/leko-types`, `@annetaan/leko-machine`,
  `@annetaan/leko-presenter` and `@annetaan/leko-spotlight` come from this
  repository under the same licence and are not what the rule is about.
- **Tightening `reached()` the way `awaits` is tightened.** The asymmetry is the
  design. The vocabulary is gathered *from* those calls, so an error there fires
  only between typing a new name and the generator running, and a `reached()`
  call has to be free to stay in the source in builds where no tour runs.
  [DESIGN.md](DESIGN.md#gathering-the-vocabulary-from-the-call-sites) states it.
- **Making an unmatched signal do something.** Warning about it, holding it
  until a step that awaits it appears, or letting a story that is not running
  keep up with it. Instrumentation has to be free to leave in the source, and a
  step advanced by something that happened while it was not on screen has
  established nothing.
- **Letting a call through while an arrival is in flight, "just this one".**
  The gate is what pays for the state core being six fields with no run
  counter. Every exception puts back a callback that has to ask afterwards
  whether the world moved while it ran.
  [DESIGN.md](DESIGN.md#one-gate-and-what-it-refuses) states it, along with the
  one exception there is and why `stop()` gets to be it.
- **Adding a back control, or a way to start a story part-way through.** A step
  that declares `awaits` cannot be returned to: the application reported that
  name once and will not report it again, so the tour waits for ever. The answer
  to a tour somebody wants to redo is a shorter story.
  [DESIGN.md](DESIGN.md#a-story-is-atomic-and-stories-are-short) argues it.
- **Carrying more than a story id across a page load.** A step index, a
  "resume at step 3", a promise to skip an `onEnter` that already ran. A step
  that declares `awaits` cannot be returned to, and a page load does nothing to
  change that: what crosses is one story id, taken once.
  [DESIGN.md](DESIGN.md#a-page-load-ends-the-story-and-hands-it-on) argues it.
- **Dropping the `pageshow` listener because no engine ever showed a
  restore.** The spike never saw one and neither did Playwright, which makes
  the listener look like dead code. It is not: a restore hands back a note
  whose document was never left, and without `forget()` that note starts the
  successor from an unrelated page load later in the same tab.
  [DESIGN.md](DESIGN.md#a-page-load-ends-the-story-and-hands-it-on) argues it,
  and says plainly that it rests on the specification's guarantee rather than a
  measurement.

## Adding a spike

A page under [`spike/`](spike/) is worth keeping when its answer would otherwise
have to be taken on trust — when a rule rests on a browser not doing what the
specification suggests it might. Keep it dependency-free, free of Leko, and
readable top to bottom in one sitting. [`spike/README.md`](spike/README.md) has
the rest.

## License

Leko is [MIT](LICENSE), and contributions are accepted on those terms. Changing
the license once outside contributions have arrived is impractical, so it stays
that way.
