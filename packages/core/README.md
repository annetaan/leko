# @annetaan/leko

**The spotlight you can click through.**

Product tours that cut a real hole in the overlay, so the user interacts with
your actual UI instead of watching a picture of it.

> [!WARNING]
> **Not released yet.** The published version is a `0.0.0` placeholder and the
> API will change without notice. Do not use it in production.

Every other tour library puts a transparent layer over the thing it highlights.
That layer eats the clicks and the keystrokes, so the best it can do is *point
at* a button and say "click here."

Leko cuts a hole instead. The overlay is a scrim with an even-odd `clip-path`,
so the highlighted element is genuinely uncovered — clicks, focus, keys and the
wheel all reach it — and the step advances only when your application says it
actually succeeded.

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
    },
    {
      id: 'create',
      target: 'button[type="submit"]',
      message: 'Now create the account.',
    },
  ],
})

tour.start()

async function onSubmit() {
  await api.createAccount(form)
  tour.nextStep() // a no-op if no tour is running, so it needs no guard
}
```

- No runtime dependencies, no framework required.
- Nothing of Leko's is ever placed over the target, not even a transparent
  element.
- Scrolling a tour runs no JavaScript at all.

## Browser support

The cutout needs `clip-path: path()` and interpolation between two path values.
The floor that implies has not been measured yet, so no version table is
published here — one will land with the first release rather than before it.

CSS Anchor Positioning (Chrome/Edge 125+, Firefox 132+, Safari 18.2+) places the
step message beside its cutout and nothing else, so it degrades rather than
fails: without it the message docks to the foot of the viewport.

## More

Source, design notes and the browser evidence behind them:
[github.com/annetaan/leko](https://github.com/annetaan/leko).

## License

MIT © Annetaan Inc.
