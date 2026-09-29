import { describe, expect, it } from 'vitest'

import {
  anchors,
  citations,
  defenced,
  links,
  paragraphs,
  slugs,
  uncommented,
  unread,
  walk,
} from './citations.mjs'

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

  it('reads one whose run-up is longer than sixty characters', () => {
    // The shape four citations in the tree are written in, at the length of the
    // longest: a reason, a comma and a file name between the document and the
    // heading, and 106 characters of it. A run-up bounded at sixty missed all
    // four without saying so.
    const text =
      'DESIGN.md argues the split, and why a name is written down twice in a package rather than imported from `types.ts`, under **The halo**'
    expect(headings(text)).toEqual(['The halo'])
  })

  it('gives the heading to the nearer of two documents named', () => {
    // The farther name won while the run-up could reach past a nearer one, so
    // a heading that is there was reported against a document that does not
    // have it.
    expect(citations('CONTRIBUTING.md says the rule DESIGN.md argues under **The halo**')).toEqual([
      { doc: 'DESIGN.md', heading: 'The halo' },
    ])
  })

  it('does not reach across a table cell wall', () => {
    // A table is one line by the time `paragraphs` is done with it, which puts
    // the bold of a later cell in reach of a name in an earlier one.
    expect(headings('| DESIGN.md | the scrim | it sits under **The halo** |')).toEqual([])
  })

  it('does not reach past a question the document is named in', () => {
    expect(headings('Is that what DESIGN.md says? The rule sits under **The halo**')).toEqual([])
    expect(headings('Read CLAUDE.md, and see! The rule sits under **The halo**')).toEqual([])
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

describe('uncommented', () => {
  it('lets a citation wrap across YAML comment lines', () => {
    const file =
      '      # says it. CONTRIBUTING.md,\n      # **Code blocks on the site** says\n      - run: x\n'
    expect(paragraphs(uncommented(file)).flatMap(citations)).toEqual([
      { doc: 'CONTRIBUTING.md', heading: 'Code blocks on the site' },
    ])
  })

  it('ends a paragraph at a comment line that is only a #', () => {
    const file = '# the rest DESIGN.md argues\n#\n# under **Some heading** of the next\n'
    expect(paragraphs(uncommented(file)).flatMap(citations)).toEqual([])
  })
})

describe('unread', () => {
  it('reports a wording it did not read', () => {
    // The one in the tree: a colon, three real headings after it, and the
    // first of the three silently unread.
    expect(unread('DESIGN.md argues each of them: **The halo**')).toEqual([
      'DESIGN.md argues each of them: **The halo**',
    ])
  })

  it('reports nothing where the wording was one of the three', () => {
    expect(unread('DESIGN.md, **The halo**')).toEqual([])
    expect(unread("DESIGN.md's **The halo**")).toEqual([])
    expect(unread('DESIGN.md argues it under **The halo**')).toEqual([])
  })

  it('takes bold that is only emphasis for what it is', () => {
    // The report has to stay worth reading, so a wider set of conjunctions
    // must not turn emphasis into a failure.
    expect(unread('DESIGN.md is clear that the scrim is **never** clipped')).toEqual([])
    expect(unread('for the reason CONTRIBUTING.md gives. **Decide by grepping.**')).toEqual([])
  })

  it('reports nothing where a conjunction is only the end of a word', () => {
    // `at` is the end of `what` and `in` the end of `origin`, and either would
    // make every stressed word after one of them a failure.
    expect(unread('DESIGN.md says what **a hole** is')).toEqual([])
    expect(unread('DESIGN.md puts the origin **there**')).toEqual([])
  })

  it('reports nothing where a conjunction is only the end of a hyphenated word', () => {
    // The half a word boundary alone lets through: a hyphen is not a word
    // character, so `\b` stands right before the `in` of `built-in`.
    expect(unread('DESIGN.md calls it a built-in **guarantee**')).toEqual([])
    expect(unread('CLAUDE.md wants an opt-in **flag** here')).toEqual([])
  })

  it('reports a conjunction a bracket opens', () => {
    // What a boundary of `(?<=\s)` would drop instead, and it is a wording
    // nobody can read.
    expect(unread('DESIGN.md (in **The halo**) is where')).toEqual(['DESIGN.md (in **The halo**'])
  })
})

describe('defenced', () => {
  it('checks no citation written inside a fenced block', () => {
    const page = '```md\nDESIGN.md, **A heading shown as an example**\n```\n'
    expect(paragraphs(defenced(page)).flatMap(citations)).toEqual([])
  })

  it('leaves a fence parting the paragraphs either side of it', () => {
    // Blanked and not dropped, or the prose above the block and the bold below
    // it become one paragraph and one citation of a heading nobody wrote.
    const page = 'the rest is in DESIGN.md\n```\ncode\n```\n**Some bold opener** of what follows\n'
    expect(paragraphs(defenced(page)).flatMap(citations)).toEqual([])
  })
})

describe('walk', () => {
  it('yields a fence whose closing line carries an info string as code, not as its close', () => {
    const page = 'before\n```md\n```js\ncode\n```\nafter'
    expect([...walk(page)]).toEqual([
      { line: 1, text: 'before' },
      { line: 2, info: 'md', code: ['```js', 'code'], closed: true },
      { line: 6, text: 'after' },
    ])
  })

  it('yields a fence that runs to the end of the file as not closed', () => {
    expect([...walk('text\n~~~ts\nconst a = 1\n')]).toEqual([
      { line: 1, text: 'text' },
      { line: 2, info: 'ts', code: ['const a = 1', ''], closed: false },
    ])
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

  it('takes the bold a numbered item opens with', () => {
    // The shape the three constraints are named in, in both CLAUDE.md and
    // CONTRIBUTING.md. A `1.` names a rule as often as a `-` does, and either
    // marker may be a bracket.
    expect(anchors('1. **A rule a numbered item names.** The words go first.')).toEqual(
      new Set(['A rule a numbered item names']),
    )
    expect(anchors('7) **A rule a bracketed marker names**')).toEqual(
      new Set(['A rule a bracketed marker names']),
    )
  })

  it('takes the bold a numbered item opens with when the item wrapped over lines', () => {
    const page = `1. **A rule whose name is long enough that the document wrapped it over
   two lines.** The words go first.
`
    expect(anchors(page)).toEqual(
      new Set(['A rule whose name is long enough that the document wrapped it over two lines']),
    )
  })

  it('leaves a nested bullet out of the numbered item above it', () => {
    const page = '1. **The rule**, which holds because\n   - **The nested reason**\n'
    expect(anchors(page)).toEqual(new Set(['The rule', 'The nested reason']))
  })

  it('leaves a bold that opens a paragraph alone', () => {
    // The head of a list item means a name. The head of a paragraph does not:
    // most of DESIGN.md's are two lines under the section heading that already
    // names the rule, and the rest are as often the stressed claim of the
    // paragraph as anything a citation would reach for.
    expect(anchors('**A claim a paragraph opens with.** The rest follows.\n')).toEqual(new Set())
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

describe('slugs', () => {
  it("spells a heading the way a link's fragment does", () => {
    expect(slugs('## How to write here, and where tests go\n')).toEqual(
      new Set(['how-to-write-here-and-where-tests-go']),
    )
  })

  it('leaves the gap a dropped character made', () => {
    // Each space becomes a hyphen, not each run of them, so a dropped `&`
    // leaves two.
    expect(slugs('### Resolution & custom functions\n')).toEqual(
      new Set(['resolution--custom-functions']),
    )
  })

  it('numbers the second heading that spells the same fragment', () => {
    expect(slugs('## Drawing\n### Drawing\n#### Drawing\n')).toEqual(
      new Set(['drawing', 'drawing-1', 'drawing-2']),
    )
  })

  it('spells no heading written inside a fenced block', () => {
    // A shell script quoted in a document, whose comments start with `#`.
    expect(slugs('```sh\n# grip: the share of each pair that is shell\n```\n')).toEqual(new Set())
  })
})

describe('links', () => {
  it('finds a fragment written against another document', () => {
    expect(links('[Scrolling](DESIGN.md#scrolling) first.')).toEqual([
      { target: 'DESIGN.md', fragment: 'scrolling' },
    ])
  })

  it('finds one written against the citing file itself', () => {
    expect(links('[Retaking the reading](#retaking-the-reading) or')).toEqual([
      { target: '', fragment: 'retaking-the-reading' },
    ])
  })

  it('finds one written as a repository URL', () => {
    // What a document read from outside the file tree has to write — a package
    // page on the registry, a GitHub issue form — and it names a heading just
    // the same.
    const text =
      '[DESIGN.md](https://github.com/annetaan/leko/blob/main/DESIGN.md#the-halo) for why'
    expect(links(text)).toEqual([{ target: '/DESIGN.md', fragment: 'the-halo' }])
  })

  it('finds one written with a title', () => {
    // A title is ordinary markdown and used to take the fragment out of the
    // check without changing anything a reader could see. All three spellings
    // CommonMark gives a title, and the spacing it allows inside the brackets.
    expect(links('[x](DESIGN.md#the-halo "why") for why')).toEqual([
      { target: 'DESIGN.md', fragment: 'the-halo' },
    ])
    expect(links("[x](DESIGN.md#the-halo 'why')")).toEqual([
      { target: 'DESIGN.md', fragment: 'the-halo' },
    ])
    expect(links('[x](DESIGN.md#the-halo (why))')).toEqual([
      { target: 'DESIGN.md', fragment: 'the-halo' },
    ])
    expect(links('[x]( DESIGN.md#the-halo )')).toEqual([
      { target: 'DESIGN.md', fragment: 'the-halo' },
    ])
  })

  it('leaves a link with no fragment alone', () => {
    expect(links('[DESIGN.md](DESIGN.md) is the argument')).toEqual([])
    expect(links('[the sandbox](examples/sandbox/) resolves from source')).toEqual([])
  })
})
