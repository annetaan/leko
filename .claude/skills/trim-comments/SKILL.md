---
name: trim-comments
description: Trim the comments in a file of this repository to the rule DESIGN.md argues under "Comments are the last place a fact goes" — delete what the code already carries, collapse what another document carries into a citation of its heading, and keep only facts with no other home. Use when asked to trim, thin, dedupe or review the comments in a file, or when a file's comments have grown longer than the code they sit in.
---

# Trimming comments

The rule is DESIGN.md's, under **Comments are the last place a fact goes**, and
CLAUDE.md states it. Read the DESIGN.md section before the first file. This is
the procedure for applying it, and nothing here overrules it.

## What this is for

A comment is read only by somebody already in the file, and nothing checks it.
So a fact kept there has no reader looking for it and no test holding it true,
and a rule nobody knows to grep for gets written a second time. Trimming is
removing the copies, not removing the reasons.

**Nobody reads the diff.** The point of the trim is to make a file readable, and
paying a full read to produce it defeats it. What replaces the review is the
three checks below and the fact that git keeps every deleted comment for ever —
a fact wanted later is one `git log -p` away, so deleting one too many is cheap
and reversible.

## Deciding, one comment at a time

Ask in this order and stop at the first yes:

1. **Do the code, the types or the names already say it?** Delete it.
2. **Does DESIGN.md, CLAUDE.md, CONTRIBUTING.md, ONBOARDING.md, a sandbox case
   or another source file already say it?** Collapse it to a citation —
   `DESIGN.md, **The halo**` or `` `scrolls-into-view.ts` shows it `` — and
   never re-argue it alongside the citation. **Grep for this; do not decide it
   from memory.** `overlap.mjs` below is that grep.
3. **Is it one of the four kinds DESIGN.md keeps?** A browser's behaviour and
   the page that shows it, what was tried and broke, a number's reason, an
   invariant the types cannot spell. Keep it.
4. Otherwise delete it.

Three rules ride on top:

- **An effect performed is not an effect explained.** A presenter method that
  performs an effect must not restate what the effect means: that is on the
  `Effect` union in the plan the effect came from. The method's comment carries
  only what the DOM work adds.
- **Public JSDoc is a different job.** In `packages/types/src/types.ts` the
  reader is a consumer hovering in an editor, with no DESIGN.md to hand. What a
  type is and how to use it stays. Why it was designed that way still collapses
  to a citation.
- **A test asserted is not a rule argued.** A `describe` name is the axis and a
  `test` name is the claim, so a comment beside one carries what the staging and
  the assertion added and nothing else — a browser's behaviour, a number's
  reason, or the reading of an assertion whose shape does not say what it is
  about. Restating the rule the test exercises belongs to the plan, the types or
  DESIGN.md. The reading is the one to keep: an assertion in a bound form —
  greater than zero, does not contain, has length nothing — says nothing on its
  own, and what it is asserting has to be written beside it.

## The three checks

Run all three on every file, and report their output rather than a summary of
it.

```
node .claude/skills/trim-comments/code-identity.mjs <file>   # the code did not move
node .claude/skills/trim-comments/overlap.mjs <file>         # nothing kept is written twice
pnpm check:citations && pnpm typecheck && pnpm format:check && pnpm lint
```

`code-identity.mjs` strips both HEAD and the working tree and compares. It has
to say *code identical*; a trim that moved a line of code is a failed trim, and
a green typecheck does not catch one because a comment cannot break a build.

**It is blind to a compiler directive.** `@ts-expect-error` is a comment the
compiler runs, and `strip()` drops it like any other, so deleting one leaves
this saying *code identical* and `pnpm test` green — the type tests are not a
Vitest project — with `pnpm typecheck` the only thing that reddens. Under
`packages/leko/type-tests/` that check is the one that matters. Keep the
directive's token and trim only the prose behind it.

**A comment that holds a literal open is code.** Delete the trailing comments
inside a multi-line array or object and the formatter collapses it onto one
line, which either fails `format:check` or moves a line of code. Leave them.

`overlap.mjs` reports every run of eight words this file's comments share with
anything else tracked. A hit is not a verdict — this repository has a vocabulary
and it repeats — but every hit long enough to be a sentence is a paragraph
written twice, and the comment is the copy that goes.

The one hit to read past is a citation of a long name. A heading here can be a
whole sentence, and a citation of one quotes it verbatim, so the citation is
itself an eight-word run shared with the document it points into. That hit is
the pointer landing, not a copy of the argument.

`check:citations` is the CI gate: a citation has to name a heading that is
there. It runs on every push, so a collapsed comment cannot quietly rot.

## Order

Trim the files somebody is about to read, in the order they will read them.
Trimming a file nobody has opened returns nothing today.

Where two files share a paragraph, trim the one that owns the fact first, so
the pointer the second one grows has somewhere to land. The repository usually
says which owns it: `packages/presenter/model/README.md` opens by saying the
machine's README carries the shared method, and the same asymmetry sorts the
two `replay.test.ts`.

`examples/sandbox` and `packages/codegen` are near a fifth of their code, so
run `overlap.mjs` before opening either — a file with no hits is a file to
leave alone.

## Never

- **Do not touch code.** Not a rename, not a reorder, not a formatting fix.
  Those are their own commits.
- **Do not touch `spike/`.** Those pages are dated evidence and one is attached
  to a Chromium bug.
- **Do not touch a sandbox case's `message` or `proves` text.** A viewer reads
  those; they are the fact's home, not a copy of it.
- **Do not set a ratio target.** A number to hit is met by deleting the browser
  facts, which are the hardest to write and the only ones nothing else records.
