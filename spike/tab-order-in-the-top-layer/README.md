# Where does a popover sit in the tab order?

Leko's message and its way out are `popover` elements appended to the end of
`document.body`. They paint over everything. **The question is whether painting
over everything also moves them in the tab order**, because a ring built on the
assumption that they come last is a ring that visits the page in the wrong
order if they do not.

```bash
open index.html          # including Safari's answer
node run.mjs             # Playwright's Chromium, Firefox and WebKit
node run.mjs chrome      # the real installed Chrome
```

Five buttons in the page, then a popover holding two more. Press Tab from the
first and the readout says the order focus actually took.

## Seen on

| | Verdict |
| --- | --- |
| Chrome 151.0.0.0 | DOM position kept |
| Chromium 151.0.7922.34 (Playwright) | DOM position kept |
| Firefox 153.0 (Playwright) | DOM position kept |
| WebKit 605.1.15 (Playwright) | DOM position kept |

macOS, 2026-08-28. Safari has not been checked by hand yet.

Firefox and Safari on macOS only tab to buttons when *Keyboard navigation* is on
in the system settings. Playwright's Firefox has it on. A hand run in a browser
that does not will stop at the first button, and `run.mjs` refuses to print a
verdict in that case rather than reporting an order it never saw.

## What it settled

**The top layer changes what paints over what, and nothing about sequential
focus navigation.** A popover is reached at its DOM position, so a box that
covers the page is still the last thing Tab arrives at.

## Why it matters

Leko draws chrome of its own and appends it to the end of the body. A step's
target is somewhere in the middle of the page. So the order a ring wants —
target, then the message, then the way out — is the order the browser already
takes, and the ring only has to catch focus at the two ends rather than
reorder anything in between.

That keeps `focus.ts` to a net and two ends. A version that had to impose an
order would need every focusable in the page enumerated and sorted, which is the
part that makes a focus trap large.

## Revisiting

If an engine starts hoisting top-layer elements in the tab order, the ring still
closes — every stop in it is one Leko names by hand — but the order between the
target and the chrome stops matching the page, and the redirects fire where they
used to be unnecessary. This page is the check.
