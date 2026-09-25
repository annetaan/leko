# CLAUDE.md

This is Leko Scroll, a scroll-driven spotlight for a long page. It is a second
product in the same repository as Leko, with no story and no steps.

**Read [DESIGN.md](DESIGN.md) before changing anything here.** It states every
rule of this package next to its reason. This file says how to work here and
points at the rule, and does not argue one.

## What applies here, and what does not

The root DESIGN.md, the three constraints it opens with, and root CLAUDE.md's
**What looks like an improvement and is not** and its **Writing code here** are
the tour's. They are not applied here, not brought in by analogy, and not cited
as a reason for anything. Root CLAUDE.md's **Working in this repository**
applies in full. [A second product, not a second
tour](DESIGN.md#a-second-product-not-a-second-tour) says why.

## How it ships

This is a private package, reached from `@annetaan/leko/scroll`.
`packages/leko` imports it and bundles it in, so the dependency runs from
`packages/leko` to this package and never back.

## The spotlight

`packages/spotlight` may be imported, and is never changed for Leko Scroll's
sake. What does not fit is copied into this package and reworked, and what the
two copies come to share is extracted later. [What comes from the
spotlight](DESIGN.md#what-comes-from-the-spotlight) says why.

## Writing code here

The core is pure and the shell is thin: the core decides, and the shell
measures, draws and listens. The core imports nothing from the spotlight. The
core's tests run in Node, and the shell's in Chromium, Firefox and WebKit. [The
core and the shell](DESIGN.md#the-core-and-the-shell) says why.

The scroll listener is passive and reads `scrollY` and nothing else, which [The
scrim rides the page](DESIGN.md#the-scrim-rides-the-page) argues. There is no
`ResizeObserver`: the page is measured at the moments
[Measuring](DESIGN.md#measuring) names, and when `measure()` is called.

A rule and its reason go in DESIGN.md and a comment holds only a fact no other
place holds, so where DESIGN.md carries the fact a comment cites its heading by
a link and never argues it again.

## Pointing at a rule

`scripts/check-citations.mjs` reads a bare `DESIGN.md` or `CLAUDE.md` with bold
after it in the same sentence as a citation of a heading in the root file of
that name. So a rule of this package is pointed at with a link and a fragment,
from prose and from a comment alike, such as [The line and the
switch](DESIGN.md#the-line-and-the-switch). The path is relative to the file
the link is written in, so a comment under `src/` writes
`../DESIGN.md#the-line-and-the-switch`. The check fails a fragment that no
heading spells.

## The example page

`examples/scroll` is one long page, and the sandbox's conventions do not bind
it. [The example page](DESIGN.md#the-example-page) says why.
