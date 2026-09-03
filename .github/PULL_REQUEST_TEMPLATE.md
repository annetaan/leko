## What this makes true

<!-- What is true after this change that was not true before. One or two
     sentences; the diff says how. -->

## Checks

- [ ] `pnpm typecheck && pnpm lint && pnpm format && pnpm test`
- [ ] Behaviour a user would notice has a case in `examples/sandbox/src/cases/`,
      stating what it proves
- [ ] A new claim about what a browser does has a page in `spike/`, and the rule
      it supports cites it

## The three constraints

All three are explained in
[DESIGN.md](https://github.com/annetaan/leko/blob/main/DESIGN.md). Tick them, or say
below why the change is still right.

- [ ] Nothing of Leko's is placed over the target, not even a transparent
      element
- [ ] No DOM event advances a step; the host application still decides
- [ ] No tour-only code moves into the application. A call site still reports
      what happened without naming a story or a step

## If this does one of these, say which

They look like improvements and are not — CONTRIBUTING.md lists them, and
DESIGN.md cites the page you can open to watch each one fail. A change that
does one of these needs to answer that page, not just the rule.

- [ ] Blocks with the clipped scrim instead of the `.leko-block` rectangles
- [ ] Moves the morph onto `element.animate()`
- [ ] Drops a subpath when a step needs fewer cutouts
- [ ] Reads layout while the user scrolls
- [ ] Uses the browser's smooth scroll for the glide
- [ ] Adds a third-party runtime dependency to `packages/leko`
