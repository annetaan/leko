<h1 align="center">Leko</h1>

<p align="center"><strong>The spotlight you can click through.</strong></p>

<p align="center">
  Let's build a tutorial your users actually work through.<br>
  With Leko, a step ends when something really happened in your app.<br>
  No layer in your way. No scroll jitter. And no dependencies.
</p>

<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a>
</p>

---

> [!WARNING]
> **Leko is not released yet.** This repository is under active development and
> the API will change without notice. Do not use it in production.

## Why another tour library?

Every tour library puts a transparent layer over the element it highlights.
That layer blocks clicks and keystrokes. So the best they can do is point at a
button and say "click here". The user only watches. Nothing sticks.

Leko's spotlight stays out of the user's way. That is because Leko cuts a hole
in the overlay.

The overlay never covers the highlighted element, so the user clicks the real
button and types in the real input. And the tour moves on only when your
application says the step actually succeeded.

```text
Other libraries          Leko
─────────────────        ─────────────────
Show  → user watches     Do  → user performs
```

## What it looks like

Leko is not on npm yet. To watch it work today, clone this repository and run
`pnpm dev`. [`examples/sandbox/`](examples/sandbox/) holds the situations a
tour has to survive, and you drive each one yourself.

Here is a story about ordering something.

```ts
import { createLeko, type LekoStory } from '@annetaan/leko'
import '@annetaan/leko/leko.css' // optional, just the --leko-* defaults

export const leko = createLeko()

// `satisfies` rather than a type annotation: it checks the story against the
// published types while leaving `awaits` as the literal you wrote, so a typo is
// reported on the line that has it.
export const firstOrder = {
  id: 'first-order',
  steps: [
    {
      id: 'intro',
      target: '#order-form',
      message: "Let's order this item.",
    },
    {
      id: 'enter-quantity',
      target: 'input[name="quantity"]',
      interactive: true,
      message: 'Enter 3 as the quantity.',
      // Your rule, your verdict. Typing something is not success.
      validate: (el) => (el as HTMLInputElement).value.trim() === '3',
      // Said under the instruction when the guard says no. The cutout shakes
      // either way, so a guard can never leave Next doing nothing.
      error: 'The quantity is not 3 yet. Check the field.',
    },
    {
      id: 'save',
      // Three regions, so three holes. The first is the one the step is about,
      // and `interactive` is what hands it to the user. Off by default, because
      // most steps explain something rather than ask for it.
      target: ['button[type="submit"]', '#tax', '#total'],
      interactive: true,
      message: 'Place the order.',
      awaits: 'order-saved',
    },
    {
      id: 'success',
      target: '#snack-bar',
      message: 'Your order is in. Nice work 🎉',
    },
  ],
} satisfies LekoStory

leko.start(firstOrder)
```

The `save` step is waiting for `order-saved`. What your code reports is that the
thing happened. Not that the tour should move on.

```ts
async function onOrderSubmit() {
  await api.createOrder(form)
  leko.reached('order-saved') // tell Leko the purchase went through
}
```

Write that line wherever something worth treating as evidence happens, and stop
thinking about it. Write as many stories as you have, and the signal moves the
one that is running, if its current step declared that name, and nothing
otherwise.

### Write several short stories, not one long one

There is no back button, and `start()` takes a story and nothing else. A story
runs from its first step forward, or it stops.

That sounds like a missing feature and it is a position. A step usually waits
for something the application reports, and once the order is saved nothing will
report it a second time, so a tour standing on that step again waits for ever.
Leko cannot tell which signals can happen twice. Neither can most applications
undo the state a step left behind.

So a story of four steps is the shape to aim for. Running it again costs a few
seconds, which is what somebody who misread step 3 should pay. A story of twenty
is where a back button starts to feel necessary, and that is the signal to split
it. What two paths share is a story as well, rather than a step they both point
at. [DESIGN.md](DESIGN.md#a-story-is-atomic-and-stories-are-short) argues it.

Splitting costs nothing at the join, because a story says what follows it.

```ts
const done = { id: 'done', steps: [/* … */] } satisfies LekoStory
const review = { id: 'review', next: done, steps: [/* … */] } satisfies LekoStory

const payment = {
  id: 'payment',
  // A story, or a function of your own state asked when the last step advances.
  // Nothing is stored, so the next run of this story asks again.
  next: () => (order.needsReview ? review : done),
  steps: [/* … */],
} satisfies LekoStory
```

Only a story that ran to the end is followed. Somebody who pressed the way out
stops where they were.

### Write the call, get the name back

Both sides of a signal are a string, and a string is easy to mistype. Nothing
fails when you do. The step just waits.

So write the `reached()` call where the thing happens, and let
[`@annetaan/leko-codegen`](packages/codegen/) hand the name back to you.

```ts
import { lekoSignals } from '@annetaan/leko-codegen/vite'

export default defineConfig({
  plugins: [lekoSignals({ out: 'src/leko-signals.d.ts' })],
})
```

It reads your project, collects every name a `reached()` call reports, and
writes them out as types. Nothing to declare and nothing to keep in step. Add a
signal by writing the call.

```ts
leko.reached('order-saved')            // you write this

awaits: 'order-saved'                  // the editor offers this
awaits: 'order-svaed'                  // and this no longer compiles
```

It asks the compiler rather than the text, so a name kept in a constant counts
too. A name built at runtime cannot be gathered, and the generator tells you
which calls those are.

`awaits` is the strict side and `reached()` never is. A `reached()` call is
meant to stay in your source forever, including in builds where no tour runs,
so a type error there would only talk you into deleting it.

Skip all of it and nothing changes for you. A name in `awaits` stays any
string, there is nothing to import, and nothing lands in your bundle.

`target` is a list, and each element of it is one hole. Write an element as a
list of its own and those elements are unioned into a single hole, so
`target: [['#label', '#input']]` lights the pair and the gap between them.

A hole is shown and not handed over until the step says `interactive: true`.
Most steps of a tour explain what is already on screen, and a click on one of
those can take the user off the page the next step points at. Every option is
documented next to itself in
[`packages/types/src/types.ts`](packages/types/src/types.ts).

## What makes it different

**The user really uses your app.** Mark a step `interactive` and Leko puts
nothing over the element it highlights. Not even a transparent layer. The real
button takes the click and the real input takes the typing. Focus and the wheel
reach it too, because nothing is intercepting them. Your tour can ask the user
to do the thing instead of watching a pointer being waved at it.

Every other step gets a hole it can be seen through and not reached through,
which is what almost every step of a tour wants.

**Scrolling stays free.** A tour costs nothing while the user scrolls, so you
never have to freeze the page or fight jitter to keep the highlight where it
belongs. Long forms and nested panels behave the way they already do.

**You decide when a step is finished.** `leko.reached('order-saved')` is the
strong one. After your API call resolved. After your validation passed. A step
moves on at a moment you are sure about, and never because a DOM event fired and
hoped for the best. A call nobody is waiting for does nothing at all — no error,
no warning, no "are we in a tour right now?" around the call — so the line is
free to stay in the source forever, including in the builds where no tour ever
runs.

**Nothing else arrives with it.** The core is plain TypeScript with no runtime
dependencies. Framework wrappers will be additive, never required.

**It survives a page load.** A story's last step can wait for the URL the
link on it goes to, and the story itself can name what follows with `next`.
Together they are the whole of the opt-in. The next document calls
`leko.pickUp(stories)` once, and it starts the successor from its first
step, with no index carried across and no `onEnter` skipped.

```ts
leko.pickUp([checkout, receipt])
```

A page load is a page load whatever produced it, so a server-rendered or
statically built site crosses the same way a plain multi-page one does. A
framework router's own same-document navigation is a different signal, and
*Browser support* below says what it takes.

## Status

| Milestone | State |
| --- | --- |
| Cutout rendering, several cutouts per step | ✅ Working |
| Animation (converge-in, step-to-step morphing) | ✅ Working |
| Step state (`steps`, `validate`, transitions) | ✅ Working |
| Placing the step message beside its cutout | ✅ Working |
| Advancing on a named signal instead of on position | ✅ Working |
| Several stories on one instance, one of them running | ✅ Working |
| Signal names gathered from the call sites, offered on `awaits` | ✅ Working |
| A next control on the message, on steps that await nothing | ✅ Working |
| A control that ends the tour, on screen for as long as it runs | ✅ Working |
| Reading `state`, and every crossing of it on `onStep` | ✅ Working |
| Advancing on a URL change | ✅ Working |
| Carrying a tour across a page load, to the story the next document runs | ✅ Working |
| `@annetaan/leko/react` · `@annetaan/leko/vue` | 📋 Planned |

## Browser support

The cutout needs CSS masking with several layers and `mask-composite`. The floor
that implies has not been measured yet, so no version table is published here.
One will land with the first release. Chrome 152, Firefox 153 and Safari 26 all
draw it.

[CSS Anchor Positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-anchor)
(Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the step message beside
its cutout and does nothing else. Where it is missing the message docks to the
bottom of the viewport, so it degrades rather than fails.

Where the Navigation API is missing, a URL-waiting step still hears a hash
change and back/forward through the `popstate`/`hashchange` fallback; only a
router's own `pushState` call goes unheard there.
[DESIGN.md](DESIGN.md#a-url-is-a-signal-the-page-reports) says what carries
and what does not. `pagehide` and `sessionStorage`, what carries a tour
across a page load, are older than any floor this file would publish; the
same fallback sentence about `pushState` bounds the same-document half.

## Looking further

- **[ONBOARDING.md](ONBOARDING.md)** is the map of the code. What to read in
  what order, and one trace from a `reached()` call to the pixels it moves.
  Start here if you are going to change something.
- **[DESIGN.md](DESIGN.md)** is why the code is shaped the way it is. Each rule
  sits next to the browser behaviour that forced it.
- **[`spike/`](spike/)** is the evidence. Three standalone pages, no build step
  and no Leko, each answering one question about what a browser actually does.
  Open one and watch the answer.
- **[`examples/sandbox/`](examples/sandbox/)** is the situations a tour has to
  survive, one per case, each stating what it proves.
- **[`packages/codegen/`](packages/codegen/)** is the generator that hands your
  signal names back to you.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** is the setup, the commands, and the
  handful of changes that look like improvements and are not.

## About the name

A **Leko** is a stage light. It is an ellipsoidal reflector spotlight, named
after Century Lighting's founders Joseph **Le**vy and Edward **Ko**ok, who built
the first one in 1933. What makes it a Leko is that you can cut its beam into
any shape you want, and it holds a crisp edge around whatever it lights.

This one does the same thing to your UI. And it lets you reach right through the
hole.

## License

[MIT](LICENSE) © [Annetaan Inc.](https://github.com/annetaan)
