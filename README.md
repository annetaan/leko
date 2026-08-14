<h1 align="center">Leko</h1>

<p align="center"><strong>The spotlight you can click through.</strong></p>

<p align="center">
  Product tours that cut a real hole in the overlay —<br>
  no layer in your way, no scroll jitter, no framework required.
</p>

---

> [!WARNING]
> **Leko is not released yet.** This repository is under active development and
> the API will change without notice. Do not use it in production.

## Why another tour library?

Every tour library puts a transparent layer over the thing it is highlighting.
That layer eats your clicks and your keystrokes, so the best they can do is
*point at* a button and say "click here." The user watches. Nothing sticks.

Leko cuts a hole instead.

The overlay is a scrim with an even-odd `clip-path`, so the highlighted element
is genuinely uncovered — the user clicks the real button, types in the real
input, and the tour advances only when your application says the step actually
succeeded.

```
Other libraries          Leko
─────────────────        ─────────────────
Show  → user watches     Do  → user performs
```

## What it looks like

Leko is not on npm yet. To watch it work today, clone this repository and run
`pnpm dev` — [`examples/sandbox/`](examples/sandbox/) is eight situations a tour
has to survive, and you drive each one yourself. This is the API:

```ts
import { createLeko } from '@annetaan/leko'
import '@annetaan/leko/leko.css' // optional — just the --leko-* defaults

const tour = createLeko({
  steps: [
    {
      id: 'email',
      target: 'input[name="email"]',
      message: 'Enter the address you want to sign in with.',
      // Your rule, your verdict. Typing something is not success.
      validate: (el) => /.+@.+\..+/.test((el as HTMLInputElement).value),
      onValidationError: (_el, utils) => {
        utils.shake()
        utils.setMessage('That does not look like an email address yet.')
      },
    },
    {
      id: 'create',
      target: 'button[type="submit"]',
      message: 'Now create the account.',
    },
  ],
})

tour.start()
```

Nothing advances until you say so, and you say so where the truth is — after the
work actually succeeded, not in a click handler:

```ts
async function onSubmit() {
  await api.createAccount(form)
  tour.nextStep() // a no-op if no tour is running, so it needs no guard
}
```

A step can highlight several adjacent elements as one hole (`target: [a, b]`),
or bring along further holes that explain it (`related: [...]`). The full set of
options is in
[`packages/core/src/types.ts`](packages/core/src/types.ts) — every field is
documented next to itself.

## What makes it different

**Direct interaction.** Nothing of Leko's is ever placed over the target, not
even a transparent element. Under the even-odd fill rule a cutout is an absence
of geometry rather than a transparent layer, so clicks, focus, keys and the
wheel all reach the element underneath untouched. The rest of the page is
blocked with plain rectangles in the gaps between the cutouts, which makes
"nothing over the target" true by construction rather than by trusting a clip.

**No per-frame position math.** The scrim lives inside the content it covers, so
scrolling moves both together and there is nothing to recompute — scrolling a
tour runs no JavaScript at all. Moving between steps is a bounded morph between
two `clip-path` values, and even that reads no layout: the numbers are worked
out at the step boundary and written out over the next few hundred milliseconds.

**Your app owns the state machine.** Steps advance when you call `nextStep()` —
after your API call resolved, after your validation passed. Not when a DOM event
fired and hoped for the best. Calling it while no tour is running is a no-op, so
you can wire it in without guarding every call site.

**No framework, no runtime dependency.** The core is plain TypeScript. Framework
wrappers are additive, never required.

## Status

| Milestone | State |
| --- | --- |
| Core rendering (`clip-path` cutout, several cutouts per step) | ✅ Working |
| Animation (converge-in, step-to-step morphing) | ✅ Working |
| State manager (`steps`, validation, transitions) | ✅ Working |
| Placing the step message beside its cutout | ✅ Working |
| `@annetaan/leko/react` · `@annetaan/leko/vue` | 📋 Planned |

## Browser support

The cutout needs `clip-path: path()` and interpolation between two path values.
The floor that implies has not been measured yet, so no version table is
published here — one will land with the first release rather than before it.

[CSS Anchor Positioning](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position-anchor)
(Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the step message beside its
cutout and nothing else, so it degrades rather than fails.

## Looking further

- **[DESIGN.md](DESIGN.md)** — why the code is shaped the way it is. Every rule
  about the scrim sits next to the browser behaviour that forced it.
- **[`spike/`](spike/)** — the evidence. Three standalone pages, no build step
  and no Leko, each answering one question about what a browser actually does.
  Open one and watch the answer.
- **[`examples/sandbox/`](examples/sandbox/)** — the situations a tour has to
  survive, one per case, each stating what it proves.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — setup, commands, and the handful of
  changes that look like improvements and are not.

## About the name

A **Leko** is a stage light — an ellipsoidal reflector spotlight, named after
Century Lighting's founders Joseph **Le**vy and Edward **Ko**ok, who built the
first one in 1933. Its defining trait is that you can cut its beam into any
shape you want and it holds a crisp edge around whatever it lights.

This one does the same thing to your UI. And it lets you reach right through the
hole.

## License

[MIT](LICENSE) © [Annetaan Inc.](https://github.com/annetaan)
