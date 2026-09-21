# What says a same-document URL changed?

A step that waits for a URL has to hear about one without polling and without
patching `history`. Something already announces a same-document navigation —
`pushState`, `replaceState`, back/forward, a hash change, a click on an
`<a href>` — and the question is which thing, whether it comes before or after
`location` has already moved, and whether it lands inside the call that
triggered it or later, as a task.

```bash
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
node run.mjs webkit      # one engine on its own
node run.mjs serve       # then open the URL in Safari and read the table
```

The page runs eight actions once on load, in order, each on a fresh listener
window: `pushState`, `pushState` again, `replaceState`, `location.hash = …`, a
click on an in-page `<a href>`, then `history.back()` twice and
`history.forward()` once to walk back across the entries the earlier actions
made. Every `window.popstate` and `window.hashchange` listener records what
`location` reads at the moment it runs, and whether it ran while the
triggering call was still on the stack (`sync`) or after it returned
(`later`); the Navigation API's `currententrychange` and `navigatesuccess` are
recorded the same way, when `'navigation' in window`. The page draws its own
table of the result as it runs. `run.mjs` serves `index.html` over `node:http`
rather than opening it as a `file://` URL: some engines refuse `pushState` on
`file://`.

## What it answers

- **`location` has already moved by the time any handler runs.** Every fired
  event's recorded `location` matches the URL the action produced, in every
  engine, in every case below — there is no handler that sees the old URL.
- **`pushState` and `replaceState` fire nothing but the Navigation API**, and
  only `currententrychange`, synchronously inside the call, in every engine
  tested. Neither fires `popstate` or `hashchange` — the well-known rule holds
  — and neither fires `navigatesuccess` synchronously; that one always lands
  as a later task. For the fallback (`popstate` + `hashchange`, no Navigation
  API) this means a router's own `pushState` is inaudible: that path hears a
  hash change and a traversal, never a route change made the way a router
  actually makes one. This page never observed that fallback path on an engine
  that lacks the Navigation API — every `popstate`/`hashchange` row below was
  taken on an engine that has it too.
- **The three current engines this spike could reach all have the Navigation
  API.** `'navigation' in window` is `true` in Chromium 151, Firefox 153 and
  WebKit `Version/26.5` as tested here. That is a claim about the top only:
  the API landed in Firefox 141 and Safari 26, and Playwright brings the
  latest build of each, so this page says nothing about the floor — a Safari
  18.x still in use today has no Navigation API, and this page never touched
  one. See "What it does not answer" below.
- **A hash change fires `currententrychange` and `popstate` synchronously**,
  whether the hash was set by assigning `location.hash` or by clicking an
  `<a href>` to a fragment — in Chromium and WebKit for both, and in Firefox
  for the assignment but not the click, where all four events land later.
  `hashchange` itself is never synchronous anywhere: it is a later task in
  every engine, for both ways of changing the hash.
- **Back and forward never fire anything synchronously.** `history.back()`
  and `history.forward()` return before the session history has actually
  moved; every event they cause — `currententrychange`, `popstate`,
  `navigatesuccess`, `hashchange` — lands as a later task, in every engine.
  The first attempt at this page used a 50ms wait between actions and lost
  events to the next action's window in Firefox, where a `back()` took longer
  than that to resolve; 300ms was enough in every engine tested.
- **What this settles for the design in issue #7, and only this much**: in the
  three engines tested, `currententrychange` fires synchronously inside
  `pushState` and `replaceState`, so routing an application does with either
  of those from inside a step's `onEnter` lands inside Leko's own gate on that
  call and is dropped as `signal-dropped`, the same as any other signal fired
  while an arrival is in flight. It does not hold for every same-document
  navigation: a click on an in-page `<a href>` is later in Firefox, and
  `history.back()`/`history.forward()` are later in all three engines, so
  routing built on either of those is not caught by the gate at all.

## Seen on

### What fires, and when

| action | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| pushState to a new path | currententrychange (sync), navigatesuccess (later) | currententrychange (sync), navigatesuccess (later) | currententrychange (sync), navigatesuccess (later) |
| pushState again | currententrychange (sync), navigatesuccess (later) | currententrychange (sync), navigatesuccess (later) | currententrychange (sync), navigatesuccess (later) |
| replaceState | currententrychange (sync), navigatesuccess (later) | currententrychange (sync), navigatesuccess (later) | currententrychange (sync), navigatesuccess (later) |
| location.hash = | currententrychange (sync), popstate (sync), navigatesuccess (later), hashchange (later) | currententrychange (sync), popstate (sync), navigatesuccess (later), hashchange (later) | currententrychange (sync), popstate (sync), navigatesuccess (later), hashchange (later) |
| `<a href>` click | currententrychange (sync), popstate (sync), navigatesuccess (later), hashchange (later) | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (sync), popstate (sync), navigatesuccess (later), hashchange (later) |
| history.back() | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (later), popstate (later), navigatesuccess (later), hashchange (later) |
| history.back() again | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (later), popstate (later), navigatesuccess (later), hashchange (later) |
| history.forward() | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (later), navigatesuccess (later), popstate (later), hashchange (later) | currententrychange (later), popstate (later), navigatesuccess (later), hashchange (later) |

### The Navigation API

| | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| `'navigation' in window` | yes | yes | yes |

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`),
all headless, at the default viewport.

**Safari 26.5 (21624.2.5.11.4), opened by hand** over `node run.mjs serve`,
agreed with the WebKit column on every row: `'navigation' in window` is `true`,
`pushState`, `pushState` again and `replaceState` fired `currententrychange`
synchronously and nothing else until a later `navigatesuccess`, the hash
assignment and the `<a href>` click fired `currententrychange` and `popstate`
synchronously with `navigatesuccess` and `hashchange` later, both `back()`s
and the `forward()` fired all four later, and every handler read the new
`location`. Playwright's WebKit is not Safari, per
[`spike/README.md`](../README.md); this row is the one that is.

## What it does not answer

- **Whether every engine that ships the Navigation API implements
  `currententrychange` the same way this page found it.** This page only
  tested the timing this repository could reach; a future engine, or a future
  version of one of these three, could change it, which is exactly why this
  page stays rather than being taken on trust.
- **What a Navigation-API-less engine does.** Playwright brings the latest
  build of Chromium, Firefox and WebKit, and all three now have the API; a
  Safari still on 18.x does not. This page has nothing to say about that
  floor, only that the fallback it did not get to exercise here is `popstate`
  + `hashchange`, per the design.
- **A navigation across a page load.** Every action here is same-document; a
  full navigation tears down and reloads the document, which is a different
  question ([#103](https://github.com/annetaan/leko/issues/103)) and out of
  scope for the step design this page feeds.
- **Whether `location.hash =` and `<a href>` clicks to a different pathname or
  search behave the same way.** Both actions tested here only ever change the
  hash; a `pushState`-style change of `pathname` or `search` from a click
  would leave the page (a full navigation) unless something already intercepts
  it, which this page does not attempt.
- **Router integration, URL normalisation, or arrival-time matching.** None of
  those are what this page was written to settle; issue #7 rules them out for
  reasons that belong there, not here.
