# Does a render beat the next frame?

A handler that calls `setState` and then `leko.reached()` leaves the
framework's render behind it, and a step handed over in that call is drawn on a
frame Leko requests inside it. The question is whether that frame comes after
the render. A microtask is ordered before any frame by the specification; a
task is not, and React's Scheduler renders in a task outside React's own
handlers. So the page asks, for four kinds of work a call can leave behind,
whether it runs before the frame requested after it, between that frame and the
one after, or later still.

```bash
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
node run.mjs webkit      # one engine on its own
node run.mjs serve       # then open the URL in Safari and read the tables
```

Each trial starts in a timer task, the way code after `await save()` does, at a
random point of the frame: a `setTimeout` of 0–16ms set from a
`requestAnimationFrame` callback. Inside that task it leaves one variant's work
behind and then requests a frame, *frame 1*, which requests *frame 2*. The
trial records where the work's own mark landed. The four variants:

- `microtask`: `queueMicrotask`, the way React inside its own handlers, Vue,
  Svelte, Preact and Lit flush an update. The specification runs it before any
  frame, so this row is the page checking itself.
- `message-in-call`: a `MessageChannel` message posted inside the call, the way
  React 18's Scheduler posts a render outside React's own handlers.
- `message-from-microtask`: a microtask queued in the call that posts the
  message, the way React 19 schedules one outside its own handlers
  (`processRootScheduleInMicrotask` calls `scheduleCallback`, which posts).
- `timeout-0`: `setTimeout(0)`, for comparison only.

Each runs 100 trials under two loads, round-robin with the others: `idle`, and
`busy`, where a `requestAnimationFrame` loop spins the main thread for about
12ms every frame for the whole batch. The page draws a table per load, marks a
`message-*` trial after frame 1 and a `microtask` trial anywhere but before
frame 1 in red, and prints a verdict. A run takes under a minute per engine.
`run.mjs` serves `index.html` over `node:http`, the way
[`a-same-document-navigation/`](../a-same-document-navigation/) does, and
waits for `window.spikeFrameReady`.

## What it answers

- **A microtask always lands before the frame.** Every `microtask` trial ran
  before frame 1 in every engine and under both loads, as the specification
  says. A framework that flushes its update in a microtask of the handler has
  rendered by the time any frame requested in that handler runs.
- **A message task usually lands before the frame, and not always.** In
  Firefox and WebKit, in every run and under both loads, some `message-in-call`
  and some `message-from-microtask` trials ran after frame 1. How many moves
  from run to run: 2 to 9 in 100 in Firefox, and 1 to 10 in 100 in WebKit. In
  Chromium the frame won none in one run and 1 in 100 idle in another, and in
  installed Chrome 1 in 100 idle. Whether the message was posted inside the
  call or from one of its microtasks makes no difference.
- **A message task never outlasts the second frame.** No trial of any variant
  in any engine or load ran after frame 2.
- **`setTimeout(0)` behaves like a message task here.** Frame 1 beat it in
  Firefox and WebKit as well, and frame 2 never did.
- **What this settles for [#32](https://github.com/annetaan/leko/issues/32): two
  frames.** The rule agreed
  before the measurement was one frame only if the frame never won, in any
  engine or load, and otherwise two. The frame won in every engine measured. A
  step handed over inside a call is drawn in the callback of a frame requested
  from inside the next frame's callback, and two was enough in every trial.

## Seen on

A cell is *before frame 1 / before frame 2 / after frame 2*, as counts out of
100. Chromium, Firefox and WebKit are one run of `node run.mjs`; Chrome is a
run of `node run.mjs chrome` straight after it.

### idle

| variant | Chromium | Firefox | WebKit | Chrome |
| --- | --- | --- | --- | --- |
| `microtask` | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 |
| `message-in-call` | 100 / 0 / 0 | 93 / 7 / 0 | 99 / 1 / 0 | 100 / 0 / 0 |
| `message-from-microtask` | 100 / 0 / 0 | 93 / 7 / 0 | 98 / 2 / 0 | 99 / 1 / 0 |
| `timeout-0` | 100 / 0 / 0 | 92 / 8 / 0 | 100 / 0 / 0 | 100 / 0 / 0 |
| frame interval | 16.7ms | 16.7ms | 16.9ms | 16.7ms |

### busy

| variant | Chromium | Firefox | WebKit | Chrome |
| --- | --- | --- | --- | --- |
| `microtask` | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 | 100 / 0 / 0 |
| `message-in-call` | 100 / 0 / 0 | 98 / 2 / 0 | 98 / 2 / 0 | 100 / 0 / 0 |
| `message-from-microtask` | 100 / 0 / 0 | 96 / 4 / 0 | 98 / 2 / 0 | 100 / 0 / 0 |
| `timeout-0` | 100 / 0 / 0 | 100 / 0 / 0 | 98 / 2 / 0 | 100 / 0 / 0 |
| frame interval | 16.7ms | 16.7ms | 16.7ms | 16.7ms |

Chromium 151.0.7922.34, Firefox 153.0 and WebKit 605.1.15 (`Version/26.5`),
all Playwright's builds, headless; Chrome 154.0.8037.58, installed, headless.
A second run of `node run.mjs` agreed in shape: `microtask` held everywhere,
nothing ran after frame 2, and the frame won in all three engines, Chromium
included (1 in 100 idle for each `message-*` variant, 9 in 100 at most in
Firefox, 3 in 100 at most in WebKit). The page opened on its own in WebKit
agreed again, with more: 7 to 10 in 100 for each `message-*` variant.

**Safari was not opened.** No Safari was at hand when this page was measured,
so every WebKit number above is Playwright's WebKit, which is not Safari, per
[`spike/README.md`](../README.md). Open `node run.mjs serve` in Safari and add
its row here.

## What it does not answer

- **What React itself does.** React is not run. The `message-*` variants are how
  React's Scheduler posts a render, read from React's source; another version,
  a transition, time-slicing that yields partway through a render, and Suspense
  are none of them measured. A render that yields to the browser partway
  through can finish after both frames.
- **What a real display does.** Headless frame timing is not a real display's.
  Every engine here ticked at 16.7ms, and a display at 120Hz halves the room a
  task has before the frame.
- **Safari.** Not opened; see above.
- **Any origin but a timer task.** Every trial starts in a `setTimeout`, the way
  code after an `await` continues. A click handler flushes an update in its
  microtasks, and the specification orders those before any frame; this page
  does not measure that path separately.
- **A background tab.** It gives no frame at all, so nothing here says when a
  step handed over there is drawn.
