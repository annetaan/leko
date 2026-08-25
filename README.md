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
`pnpm dev`. [`examples/sandbox/`](examples/sandbox/) holds fifteen situations a
tour has to survive, and you drive each one yourself.

Here is a story about ordering something.

```ts
import { createLeko } from '@annetaan/leko'
import '@annetaan/leko/leko.css' // optional, just the --leko-* defaults

export const leko = createLeko()

leko.setStory({
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
      message: 'Enter 3 as the quantity.',
      // Your rule, your verdict. Typing something is not success.
      validate: (el) => (el as HTMLInputElement).value.trim() === '3',
      onValidationError: (_el, utils) => {
        utils.shake()
        utils.setError('The quantity is not 3 yet. Check the field.')
      },
    },
    {
      id: 'save',
      target: 'button[type="submit"]',
      related: ['#tax', '#total'], // further cutouts, shown because they explain the target
      message: 'Place the order.',
      awaits: 'order-saved',
    },
    {
      id: 'success',
      target: '#snack-bar',
      message: 'Your order is in. Nice work 🎉',
    },
  ],
})

leko.start('first-order')
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
thinking about it. Register as many stories as you have — `leko.setStory(...)`
again, with another id — and the signal moves the one that is running, if its
current step declared that name, and nothing otherwise.

### Write several short stories, not one long one

There is no back button, and there is no way to start a story part-way through.
A story runs from its first step forward, or it stops.

That sounds like a missing feature and it is a position. A step usually waits
for something the application reports, and once the order is saved nothing will
report it a second time, so a tour standing on that step again waits for ever.
Leko cannot tell which signals can happen twice. Neither can most applications
undo the state a step left behind.

So a story of four steps is the shape to aim for. Running it again costs a few
seconds, which is what somebody who misread step 3 should pay. A story of twenty
is where a back button starts to feel necessary, and that is the signal to split
it. [DESIGN.md](DESIGN.md#a-story-is-atomic-and-stories-are-short) argues it.

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

Skip all of it and nothing changes for you. `awaits` stays `string`, there is
nothing to import, and nothing lands in your bundle.

A step can highlight several adjacent elements as one hole (`target: [a, b]`),
or bring along further holes that explain it (`related: [...]`). Every option is
documented next to itself in
[`packages/leko/src/types.ts`](packages/leko/src/types.ts).

## What makes it different

**The user really uses your app.** Leko never puts anything over the element it
highlights. Not even a transparent layer. The real button takes the click and
the real input takes the typing, and focus, the keyboard and the wheel keep
working because nothing is intercepting them. Your tour can ask the user to do
the thing instead of watching a pointer being waved at it.

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
| Advancing on a URL change, and surviving the navigation | 📋 Planned |
| Chapters, to skip over and to resume into | 📋 Planned |
| `@annetaan/leko/react` · `@annetaan/leko/vue` | 📋 Planned |

## Browser support

The cutout needs `clip-path: path()` and interpolation between two path values.
The floor that implies has not been measured yet, so no version table is
published here. One will land with the first release.

[CSS Anchor Positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-anchor)
(Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the step message beside
its cutout and does nothing else. Where it is missing the message docks to the
bottom of the viewport, so it degrades rather than fails.

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
