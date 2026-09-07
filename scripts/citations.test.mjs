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

  it('takes the bold a bullet opens with when the bullet wrapped over lines', () => {
    // DESIGN.md as it stands. Most of its named rules are bullets and most of
    // those wrap, so a name a citation may land on is more often written over
    // two lines than on one.
    const page = `- **That layer is sized past the layout viewport on purpose, gutter
  included.** The layout viewport is the box a fixed element is laid out
  against.
`
    expect(anchors(page)).toEqual(
      new Set(['That layer is sized past the layout viewport on purpose, gutter included']),
    )
  })

  it('takes a name whose bullet wrapped and whose text holds a full stop', () => {
    const page = `- **Every layer paints and catches nothing. Plain rectangles in the gaps
  between the open cutouts do the blocking.** A mask has no effect on
  hit-testing at all.
`
    expect(anchors(page)).toEqual(
      new Set([
        'Every layer paints and catches nothing. Plain rectangles in the gaps between the open cutouts do the blocking',
      ]),
    )
  })

  it('takes nothing from the next bullet where a bold opener never closes', () => {
    // The dense list, no blank line between the items: what a pattern reaching
    // over the newline would read as one name spanning both.
    const page = '- **An opener that never closes\n- **Has `awaits`:** No Next control is shown.\n'
    expect(anchors(page)).toEqual(new Set(['Has `awaits`']))
  })

  it('takes nothing from the paragraph after a bullet whose bold never closes', () => {
    const page = '- **An opener that never closes\n\nA paragraph with **its own bold** in it.\n'
    expect(anchors(page)).toEqual(new Set())
  })

  it('leaves a nested bullet out of the item above it', () => {
    const page = '- **The rule**, which holds because\n  - **The nested reason**\n'
    expect(anchors(page)).toEqual(new Set(['The rule', 'The nested reason']))
  })

  it('takes the plain run before the next bold where the opener never closes', () => {
    // The one shape the folding adds, and the one place this and a renderer
    // part company. CommonMark binds a closer to its nearest opener, so the
    // second `**` opens rather than closes and `nothing` is what a reader sees
    // emphasised (micromark 4.0.2). What comes out is a name nobody can see,
    // which is the permissive way round.
    const page = `- **A name that never closes here, and
  the continuation says **nothing** of note.
`
    expect(anchors(page)).toEqual(
      new Set(['A name that never closes here, and the continuation says']),
    )
  })

  it('takes no heading and no bullet from a fenced block', () => {
    const page = '```md\n# Not a heading\n- **Not a name**\n```\n'
    expect(anchors(page)).toEqual(new Set())
  })

  it('is not closed by a fenced line that carries an info string', () => {
    // A document showing markdown inside markdown. A closing fence takes no
    // info string, so this whole block is content.
    const page = '```md\n# Not a heading\n```js\n- **Not a name**\n```\n'
    expect(anchors(page)).toEqual(new Set())
  })

  it('is not closed by a fence of the other mark, or a shorter run of its own', () => {
    const page = '~~~md\n# Not a heading\n```\n- **Not a name**\n~~~\n'
    expect(anchors(page)).toEqual(new Set())
    const longer = '````md\n# Not a heading\n```\n- **Not a name**\n````\n'
    expect(anchors(longer)).toEqual(new Set())
  })

  it('drops the colon a bullet’s bold ends in', () => {
    expect(anchors('- **No `awaits`:** A Next control is shown.\n')).toEqual(
      new Set(['No `awaits`']),
    )
  })
})
