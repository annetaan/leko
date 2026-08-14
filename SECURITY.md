# Security

## Reporting a vulnerability

Please report privately, through
[GitHub's private vulnerability reporting](https://github.com/annetaan/leko/security/advisories/new)
— **Security** → **Report a vulnerability** on this repository. That opens a
thread only the maintainers can see. Do not open a public issue for something
you believe is exploitable.

You should get an acknowledgement within a week. If you do not, please chase it
on the same thread rather than assuming it was received.

## What is in scope

Leko is a client-side library. It renders an overlay, measures elements, and
sets `anchor-name` on an element the host page named. Things worth reporting:

- **Content from a step reaching the page as markup.** Step messages are written
  with `textContent`, never `innerHTML`. Anywhere that stops being true is a
  vulnerability, because a message may well come from a server.
- **Leko leaving something behind after `stop()`** that a later page state can
  act on — a scrim that keeps blocking, an `anchor-name` never handed back, a
  listener that outlives the tour.
- **A cutout exposing something the host did not name**, or the blocking
  rectangles failing to cover what is between the cutouts.
- Anything in the published package that a consumer's build would execute.

## What is not

- The library deliberately does not block the page anywhere a step asked for a
  hole. A tour that highlights the wrong element is a bug, not a vulnerability.
- Leko does not guard against a host page that is already compromised. It has
  no privileges of its own to escalate.
- `spike/` is standalone evidence, and `examples/sandbox/` is a demo. Neither
  ships, and neither is a supported surface.

## Supported versions

None yet. Leko is pre-release and nothing is published beyond a `0.0.0`
placeholder, so fixes land on `main` and nowhere else. This section will get a
table when there is a release to put in it.
