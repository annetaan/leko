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
so a step that asks for something can hand the element over for real. Clicks,
focus, keys and the wheel all reach it, and the step advances only when your
application says it actually succeeded.

Say so with `interactive`. It is off by default, because most steps of a tour
explain what is already on screen, and a click on one of those can take the user
off the page the next step points at. Those holes are shown and not handed
over.

```ts
import { createLeko, type LekoStory } from '@annetaan/leko'
import '@annetaan/leko/leko.css' // optional — just the --leko-* defaults

export const leko = createLeko()

// `satisfies` rather than a type annotation: it checks the story against the
// published types while leaving `awaits` as the literal you wrote.
export const signUp = {
  id: 'sign-up',
  steps: [
    {
      id: 'email',
      target: 'input[name="email"]',
      // The user has to type here, so the field is handed over. Leave this off
      // and the hole is one to read rather than one to use.
      interactive: true,
      message: 'Enter the address you want to sign in with.',
      // Your rule, your verdict. Typing something is not success.
      validate: (el) => /.+@.+\..+/.test((el as HTMLInputElement).value),
    },
    {
      id: 'create',
      target: 'button[type="submit"]',
      interactive: true,
      message: 'Now create the account.',
      awaits: 'account-created',
    },
  ],
} satisfies LekoStory

leko.start(signUp)

async function onSubmit() {
  await api.createAccount(form)
  // Says what happened, not which step should move. A signal nobody is waiting
  // for does nothing at all, so this line needs no guard and can stay in the
  // source forever.
  leko.reached('account-created')
}
```

## Your signal names, handed back to you

Optional, and one package away.
[`@annetaan/leko-codegen`](https://www.npmjs.com/package/@annetaan/leko-codegen)
reads your project, collects every name a `reached()` call reports, and writes
them out as types.

```ts
import { lekoSignals } from '@annetaan/leko-codegen/vite'

export default defineConfig({
  plugins: [lekoSignals({ out: 'src/leko-signals.d.ts' })],
})
```

After that `awaits` offers `'account-created'` because `reached()` reports it
somewhere, and a name nothing reports stops compiling. Nothing to declare and no
list to keep in step.

`reached()` itself is never tightened. It is meant to stay in your source
forever, including in builds where no tour runs.

Install none of it and `awaits` is `string`, the same as it was before any of
this existed.

## What you get

- No runtime dependencies, no framework required.
- Nothing of Leko's is ever placed over the target, not even a transparent
  element.
- Scrolling a tour runs no JavaScript at all.
- One instance holds every story and shows one of them, so a call site reports
  what happened once and never learns how many stories exist.

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
