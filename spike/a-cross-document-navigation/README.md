# What can a document being left still say?

A story whose last step waits for a URL can hand the tour on to a `next`
story across a full page load, but only if something in the leaving document
can still run code and still write something the next document can read.
Three questions, and only these three settle the design in issue #1: does
anything fire in the leaving document before the new one starts running its
own script; does a `sessionStorage` write made from inside that moment
survive to be read; and does the same-document mechanism
([`spike/a-same-document-navigation/`](../a-same-document-navigation/)) ever
fire for a navigation that leaves the document, which would mean the two
mechanisms could both answer the same navigation.

```bash
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
node run.mjs webkit      # one engine on its own
node run.mjs serve       # then open the URL in Safari and read the tables
```

`index.html` is the *leaving* page. On load it arms a listener for every
event a cross-document navigation might fire in this document —
`pagehide`, `beforeunload`, `unload`, `visibilitychange`, `popstate`,
`hashchange`, and, where `'navigation' in window`, `navigate` and
`currententrychange` — and appends what each one saw to `sessionStorage`,
because an in-memory log dies with the document. Its `pagehide` listener also
writes a second, fixed-token key, to test whether a write made there
specifically survives. `run.mjs` drives it out two ways: a click on
`<a href="next.html">` and `location.assign('next.html?x')`. `next.html` is
the *arriving* page: it reads both keys once, on load, and its own
`performance.getEntriesByType('navigation')[0].type`. Both pages also draw
their own tables, for `serve` mode. `run.mjs` serves the directory over
`node:http` rather than opening either page as a `file://` URL, for the same
reason the sibling spike gives.

## What it answers

- **(a) `pagehide` fires in the leaving document before the arriving
  document's script runs, in every engine tested.** It shows up in the log
  every time, for both ways out, in Chromium, Firefox and WebKit alike.
- **(b) A `sessionStorage` write made inside the `pagehide` handler is read
  by the arriving document, in every engine tested.** The fixed token was
  `present` on every run, for both ways out.
- **(c) `currententrychange`, `popstate` and `hashchange` never fired in the
  leaving document, for either way out, in any engine tested.** The
  same-document mechanism and this one cannot both hear one navigation,
  confirmed rather than assumed: nothing in
  [`spike/a-same-document-navigation/`](../a-same-document-navigation/)'s
  own table fires here.
- **What else fires, and in what order.** Beyond the three questions above:
  `navigate` (sync), `beforeunload` (sync) and `pagehide` (sync) all run
  before the call that triggered the navigation returns control to the task
  queue; `visibilitychange` and then `unload` follow later, after `pagehide`
  — the same order the specification gives. `beforeunload` never showed a
  confirmation prompt, because nothing here sets `event.returnValue`, so the
  harness never had to dismiss one.
- **`performance.getEntriesByType('navigation')[0].type` is `'navigate'`, on
  arrival, for both ways out, in every engine tested.** Ordinary evidence,
  not part of the design's own three claims, kept because a value logged once
  is cheap and a value assumed is not.

## What it does not answer

- **Whether the back/forward cache hands the document back rather than
  reloading it.** `pageshow.persisted` was `false` on every `history.back()`
  this page ran, in every engine, and this page did not find why. The likelier
  explanation is the automation itself: Chromium's back/forward cache is
  documented to disable itself under a remote-debugging connection, and
  Playwright's Firefox and WebKit drivers are automation protocols of their
  own, so this page's own numbers say nothing reliable about what a document a
  person is actually browsing does. `run.mjs serve`, watching the `pageshow`
  table by eye after pressing a real Back button, is the only way this
  repository has to check that — not done here; DESIGN.md's claim rests on the
  specification's guarantee about the cache, not on this page's own
  `pageshow.persisted` row.
- **The floor, and real Safari.** Playwright brings the latest build of each
  engine, so this page says nothing about how old a browser can be and still
  answer (a)–(c) the same way. Nobody has opened this page in a real Safari
  yet, the way the sibling spike's own README records somebody doing for its
  question — see that page's Safari section for what that looks like.
- **Whether a slow-loading next document changes any of this.** Every run
  here serves both pages from the same local server with nothing on the
  wire; `next.html`'s script runs as soon as it is reachable, which is not a
  claim about a page that takes seconds to arrive.

## Seen on

### What fires in the leaving document, and when

| action | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| `<a href>` click | navigation:navigate (sync), window:beforeunload (sync), window:pagehide (sync), window:visibilitychange (later), window:unload (later) | navigation:navigate (sync), window:beforeunload (sync), window:pagehide (sync), window:visibilitychange (later), window:unload (later) | window:beforeunload (sync), navigation:navigate (sync), window:pagehide (sync), window:visibilitychange (later), window:unload (later) |
| `location.assign()` | navigation:navigate (sync), window:beforeunload (sync), window:pagehide (sync), window:visibilitychange (later), window:unload (later) | navigation:navigate (sync), window:beforeunload (sync), window:pagehide (sync), window:visibilitychange (later), window:unload (later) | navigation:navigate (sync), window:beforeunload (sync), window:pagehide (sync), window:visibilitychange (later), window:unload (later) |

WebKit orders `beforeunload` ahead of `navigate` for the `<a href>` click and
nowhere else; every other row across both actions and all three engines
agrees on the order shown.

### What the arriving document found

| | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| pagehide token (click) | present, 2ms old | present, 2ms old | present, 1ms old |
| pagehide token (assign) | present, 2ms old | present, 2ms old | present, 1ms old |
| `performance` navigation type (click) | navigate | navigate | navigate |
| `performance` navigation type (assign) | navigate | navigate | navigate |

### `history.back()` to `index.html`

| | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| `pageshow.persisted` | false, false, false, false | false, false, false, false | false, false, false, false |

Four values because `index.html` is loaded fresh three times in one browser
tab over the course of a run (once for each scenario above) before the final
`history.back()`, and `pageshow.persisted` is never cleared between them —
see "What it does not answer."

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`),
all headless, at the default viewport — the same builds
[`spike/a-same-document-navigation/`](../a-same-document-navigation/) saw.
