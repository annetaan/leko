import { describe, expect, it } from 'vitest'

import { compare, exported, named, properties } from './reference.mjs'

const KNOWN = {
  names: new Set(['createLeko', 'LekoStory', 'LekoStep']),
  properties: new Set(['--leko-z', '--leko-halo-fade']),
}

/** The findings over `{ file: markdown }`, one string each. */
const findings = (pages, known = KNOWN) => {
  const { missing, unknown } = compare(known, new Map(Object.entries(pages)))
  return [
    ...missing.map(({ name }) => `missing ${name}`),
    ...unknown.map(({ file, name }) => `${file} unknown ${name}`),
  ]
}

/** A page that documents every name in `KNOWN`, and then `more`. */
const whole = (more = '') => `
| Name | Type |
| ---- | ---- |
| \`createLeko\` | function |

## LekoStory

### \`LekoStep\`

| Property | Default |
| -------- | ------- |
| \`--leko-z\` | \`9999\` |
| \`--leko-halo-fade\` | \`160ms\` |
${more}`

describe('exported', () => {
  it('reads every name in an export block, value and type alike', () => {
    const source = `export { createLeko } from './leko.js'
export { cubicBezier } from '@annetaan/leko-spotlight'
export type { Leko } from './leko.js'
export type {
  LekoOptions,
  LekoStep,
} from '@annetaan/leko-types'`
    expect([...exported(source)]).toEqual([
      'createLeko',
      'cubicBezier',
      'Leko',
      'LekoOptions',
      'LekoStep',
    ])
  })

  it('drops the type keyword and an alias from a name', () => {
    // What a consumer imports is the alias, so the alias is the name.
    const source = `export { type LekoStep, createLeko as create } from './leko.js'`
    expect([...exported(source)]).toEqual(['LekoStep', 'create'])
  })

  it('reads a name with a comment beside it', () => {
    // A `}` inside a comment would otherwise end the block early.
    const source = `export type {
  // the tour {and its steps}
  LekoStep,
  /* one story */ LekoStory,
} from '@annetaan/leko-types'`
    expect([...exported(source)]).toEqual(['LekoStep', 'LekoStory'])
  })

  it('throws on a piece of a block it cannot read as a name', () => {
    const source = `export { LekoStep, default as } from './leko.js'`
    expect(() => exported(source)).toThrow('`default as`')
  })

  it('reads nothing from a default export or a bare re-export', () => {
    const source = `export default createLeko
export * from '@annetaan/leko-types'
export * as types from '@annetaan/leko-types'`
    expect([...exported(source)]).toEqual([])
  })
})

describe('properties', () => {
  it('reads every --leko- declaration and nothing that only mentions one', () => {
    const css = `:root {
  /*
   * How long a halo takes to fade.
   * --leko-halo-fade: 0ms puts it back to a cut.
   */
  --leko-z: 9999;
  --leko-halo-fade: 160ms;
  --other: 1px;
}
.leko-block {
  z-index: var(--leko-z);
}`
    expect([...properties(css)]).toEqual(['--leko-z', '--leko-halo-fade'])
  })
})

describe('named', () => {
  it('reads the inline-code first cell of a table row', () => {
    const page = `| Field | Type | Default |
| ----- | ---- | ------- |
| \`padding\` | \`number\` | \`8\` |
|\`LekoStep\`| type | |`
    expect([...named(page)]).toEqual(['padding', 'LekoStep'])
  })

  it('reads a heading with or without backticks', () => {
    const page = `## LekoStory

### \`start\`

#### pickUp`
    expect([...named(page)]).toEqual(['LekoStory', 'start', 'pickUp'])
  })

  it('does not read a mention in prose or a later cell', () => {
    const page = `A \`LekoStep\` is one of \`LekoStory\`'s steps.

| Field | Type |
| ----- | ---- |
| steps | \`LekoStep[]\` |

## Signal types

# LekoTitle`
    expect([...named(page)]).toEqual([])
  })

  it('does not read a table shown inside a code fence', () => {
    const page = `\`\`\`md
| \`LekoStep\` | type |

## LekoStory
\`\`\``
    expect([...named(page)]).toEqual([])
  })
})

describe('compare', () => {
  it('reports a name on no page as missing', () => {
    const page = whole().replace('## LekoStory', '')
    expect(findings({ 'reference/story.mdx': page })).toEqual(['missing LekoStory'])
  })

  it('reports a property on no page as missing', () => {
    const page = whole().replace('| `--leko-z` | `9999` |', '')
    expect(findings({ 'reference/css.mdx': page })).toEqual(['missing --leko-z'])
  })

  it('reports a Leko-prefixed name or --leko- property nothing exports as unknown, with the page', () => {
    const pages = {
      'reference/story.mdx': whole(),
      'reference/leko.mdx': '### LekoStepp\n\n| `--leko-scroll-z` | `1` |',
    }
    expect(findings(pages)).toEqual([
      'reference/leko.mdx unknown LekoStepp',
      'reference/leko.mdx unknown --leko-scroll-z',
    ])
  })

  it('never judges a field or member name', () => {
    const more = `
### start

| Kind | Reported |
| ---- | -------- |
| \`story-empty\` | at \`start\` |
| \`padding\` | |
| \`Leko\` | |`
    expect(findings({ 'reference/leko.mdx': whole(more) })).toEqual([])
  })
})
