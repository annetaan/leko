import { describe, expect, it } from 'vitest'

import { compare, consumed, exported, named } from './reference.mjs'

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

describe('consumed', () => {
  it('reads every --leko- property a var() reads, with its fallback', () => {
    const source = `Object.assign(el.style, {
  zIndex: 'var(--leko-z, 9999)',
  background: 'var( --leko-scrim-color , rgb(0 0 0 / 0.45) )',
})
el.style.transition = 'opacity var(--leko-halo-fade, 160ms) ease-out'
other.style.zIndex = 'var(--leko-z, 9999)'`
    expect([...consumed(source)]).toEqual([
      ['--leko-z', '9999'],
      ['--leko-scrim-color', 'rgb(0 0 0 / 0.45)'],
      ['--leko-halo-fade', '160ms'],
    ])
  })

  it('reads a fallback with parentheses inside it whole', () => {
    const source = `maxWidth: 'var(--leko-message-max-width, min(320px, calc(100vw - 32px)))',`
    expect([...consumed(source)]).toEqual([
      ['--leko-message-max-width', 'min(320px, calc(100vw - 32px))'],
    ])
  })

  it('gives no fallback for a var() that has none', () => {
    const source = `style.top = 'calc(10px - var(--leko-message-dock))'`
    expect([...consumed(source)]).toEqual([['--leko-message-dock', undefined]])
  })

  it('throws on one property read with two different fallbacks', () => {
    const source = `a: 'var(--leko-z, 9999)',
b: 'var(--leko-z, 10000)',`
    expect(() => consumed(source)).toThrow('--leko-z')
  })

  it('does not read a property a comment names', () => {
    const source = `/*
 * A page sets var(--leko-halo-outline, none) to draw a halo.
 */
// var(--leko-halo-shadow, none) paints nothing either
const url = 'http://www.w3.org/2000/svg'
outline: 'var(--leko-z, 9999)',`
    expect([...consumed(source)]).toEqual([['--leko-z', '9999']])
  })

  it('does not read a declaration or a property outside var()', () => {
    const source = `:root {
  --leko-z: 9999;
}
const name = '--leko-halo-fade'
style.setProperty('--leko-scrim-color', 'red')`
    expect([...consumed(source)]).toEqual([])
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
