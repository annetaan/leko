# Contributing

Thanks for looking. Leko is pre-release, so the API still moves; issues that
report a broken assumption are as useful as pull requests.

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
is no fallback — [DESIGN.md](DESIGN.md#why-the-tests-run-where-they-do) says why
jsdom cannot stand in.

## Seeing it run

```bash
pnpm dev
```

That serves [`examples/sandbox/`](examples/sandbox/), which resolves the core
from source rather than from a build, so there is no watch process to keep alive
and no way to end up debugging a stale `dist/`.

The sandbox is not a showcase. Every case is something a user *does* — typing,
waiting for a request, scrolling a panel — because a demo where the user only
watches proves nothing about a library whose whole claim is that they do not.
Behaviour a user would notice wants a case there, and each case says in one
sentence what it proves.

## Commands

```bash
pnpm dev            # the sandbox, resolving the core from source
pnpm typecheck      # tsc --noEmit across workspace packages
pnpm lint           # oxlint
pnpm format         # oxfmt --write
pnpm format:check   # oxfmt --check, which is what CI runs
pnpm test           # vitest, in Chromium, Firefox and WebKit
```

Markdown is deliberately out of the formatter's reach — prose wrapping is a
judgement call, and `.editorconfig` covers the rest. So are the pages under
`spike/`: one of them is attached to a browser bug report as it stands, and a
formatter should not be rewriting evidence.

## Before opening a pull request

```bash
pnpm typecheck && pnpm lint && pnpm format && pnpm test
```

CI runs the same four, with `format:check` in place of `format`.

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org)
— `feat(core):`, `fix(core):`, `docs:`, `test:`, `build:`. Say in the body what
the change makes true that was not true before; the subject is not the place for
it.

## Two things that are not up for negotiation

They are the reasons the library exists, and both are explained in
[DESIGN.md](DESIGN.md#two-constraints-that-must-not-be-broken):

1. **Nothing is ever layered over the target.** A cutout is a hole, not a
   transparent element.
2. **Steps advance when the host application says so**, never on a DOM event
   Leko observed.

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
  reads nothing and is not the same thing.
- **Adding a runtime dependency to `packages/core`.** It has none on purpose:
  a dependency there is a licensing and bundle-size liability for every
  consumer.

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
