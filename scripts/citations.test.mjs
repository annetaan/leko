import { describe, expect, it } from 'vitest'

import { anchors, citations, paragraphs } from './citations.mjs'

const headings = (text) => citations(text).map(({ heading }) => heading)

describe('citations', () => {
  it('reads the three wordings this repository uses', () => {
    expect(headings('DESIGN.md, **The halo**')).toEqual(['The halo'])
    expect(headings("DESIGN.md's **The halo**")).toEqual(['The halo'])
    expect(headings('DESIGN.md argues it under **The halo**')).toEqual(['The halo'])
  })

  it('reads one that names a file on the way to the heading', () => {
    // The miss that matters: a citation nothing reads is a heading nobody can
    // rename safely, and naming a file in the sentence is this repository's
    // habit.
    expect(headings('DESIGN.md argues it in `plan.ts` under **The halo**')).toEqual(['The halo'])
  })

  it('reads one that wrapped over lines', () => {
    expect(headings('DESIGN.md, **Nothing is drawn for a retry**')).toEqual([
      'Nothing is drawn for a retry',
    ])
  })

  it('takes bold that is only emphasis for what it is', () => {
    expect(headings('DESIGN.md is clear that the scrim is **never** clipped')).toEqual([])
  })

  it('does not reach past the sentence the document is named in', () => {
    // The shape of a paragraph in DESIGN.md itself: a citation, a full stop,
    // and a bullet title after it.
    const text =
      'for the reason CONTRIBUTING.md gives. **Decide that by grepping, never from memory.**'
    expect(headings(text)).toEqual([])
  })

  it('leaves the link shape README.md lists the documents in alone', () => {
    expect(headings('- **[DESIGN.md](DESIGN.md)** — the argument')).toEqual([])
  })

  it('names the document the heading has to be in', () => {
    expect(citations('CONTRIBUTING.md, **Getting set up**')).toEqual([
      { doc: 'CONTRIBUTING.md', heading: 'Getting set up' },
    ])
  })
})

describe('paragraphs', () => {
  it('does not let a document named at the end of one reach the bold that opens the next', () => {
    const page = 'the rest is in DESIGN.md\n\n- **Some bold opener** of the next paragraph\n'
    expect(paragraphs(page).flatMap(citations)).toEqual([])
  })

  it('joins the lines of a paragraph, so a citation may wrap', () => {
    const page = 'DESIGN.md argues\nit under\n**The halo**\n'
    expect(paragraphs(page).flatMap(citations)).toEqual([{ doc: 'DESIGN.md', heading: 'The halo' }])
  })
})

describe('anchors', () => {
  it('takes a heading at any level', () => {
    expect(anchors('# One\n### Three\n')).toEqual(new Set(['One', 'Three']))
  })

  it('takes the bold a bullet opens with, without the full stop it ends in', () => {
    // A named rule here is as often a bullet as a section, and a citation of
    // one is written without the stop the bullet carries.
    expect(anchors('- **Nothing is drawn for the gap.** The words go first.')).toEqual(
      new Set(['Nothing is drawn for the gap']),
    )
  })

  it('leaves bold in the middle of a bullet alone', () => {
    expect(anchors('- The words of **the step being left** go first.')).toEqual(new Set())
  })
})
