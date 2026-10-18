import { describe, expect, it } from 'vitest'

import { cite } from './cite.mjs'

const root = '/repo/'
const base = 'https://github.com/annetaan/leko/blob/v0.1.0/'
const anchors = new Map([
  [
    'DESIGN.md',
    new Set(['the-halo', 'resolution--custom-functions', 'a-hole-and-whether-it-is-open']),
  ],
  ['packages/scroll/DESIGN.md', new Set(['the-message'])],
])
const at = (file, code) => cite(code, { file: `${root}${file}`, root, base, anchors })

describe('cite', () => {
  it('links a citation to the heading it names, at the tagged tree', () => {
    expect(at('packages/a/dist/index.js', '// DESIGN.md argues it under **The halo**.\n')).toBe(
      `// [DESIGN.md](${base}DESIGN.md#the-halo) argues it under **The halo**.\n`,
    )
  })

  it('keeps the possessive form readable and spells & the way GitHub does', () => {
    const code = "/** As DESIGN.md's **Resolution & custom functions** says. */\nexport {}\n"
    expect(at('packages/a/dist/index.d.ts', code)).toBe(
      `/** As [DESIGN.md](${base}DESIGN.md#resolution--custom-functions)'s **Resolution & custom functions** says. */\nexport {}\n`,
    )
  })

  it('follows a citation wrapped over several comment lines', () => {
    const code = [
      '/**',
      ' * Why the hole is there is DESIGN.md, **A hole, and',
      ' * whether it is open**.',
      ' */',
      'export const a = 1',
      '',
    ].join('\n')
    expect(at('packages/a/dist/index.d.ts', code)).toBe(
      code.replace('DESIGN.md', `[DESIGN.md](${base}DESIGN.md#a-hole-and-whether-it-is-open)`),
    )
  })

  it('resolves a relative link against the module it is written in', () => {
    const code = '/** Where it goes — [The message](../DESIGN.md#the-message). */\n'
    expect(at('packages/scroll/dist/types.d.ts', code)).toBe(
      `/** Where it goes — [The message](${base}packages/scroll/DESIGN.md#the-message). */\n`,
    )
  })

  it('resolves a link with no fragment', () => {
    const code = '// See [the spike](../../../spike/a-same-document-navigation/).\n'
    expect(at('packages/presenter/dist/presenter.js', code)).toBe(
      `// See [the spike](${base}spike/a-same-document-navigation/).\n`,
    )
  })

  it('drops a fragment that names no heading of the document', () => {
    expect(
      at('packages/a/dist/index.js', '// DESIGN.md, **Nothing is drawn for the gap**.\n'),
    ).toBe(`// [DESIGN.md](${base}DESIGN.md), **Nothing is drawn for the gap**.\n`)
  })

  it('drops a fragment a relative link names that is no heading of the file', () => {
    const code =
      '/** [The halo](../DESIGN.md#the-halo) and [a spike](../../../spike/a/README.md#x). */\n'
    expect(at('packages/scroll/dist/types.d.ts', code)).toBe(
      `/** [The halo](${base}packages/scroll/DESIGN.md) and [a spike](${base}spike/a/README.md). */\n`,
    )
  })

  it('rewrites a link whose target is a bare document name as one link', () => {
    expect(at('index.js', '// [the halo](DESIGN.md#the-halo)\n')).toBe(
      `// [the halo](${base}DESIGN.md#the-halo)\n`,
    )
  })

  it('points a bare document name at the tagged tree', () => {
    expect(at('packages/a/dist/index.js', '// CLAUDE.md states both.\n')).toBe(
      `// [CLAUDE.md](${base}CLAUDE.md) states both.\n`,
    )
  })

  it('leaves code, absolute URLs, fragment-only links and link text alone', () => {
    const code = [
      "const a = 'DESIGN.md, **The halo**'",
      '// [CLAUDE.md](https://example.com/CLAUDE.md) and [below](#below),',
      '// packages/scroll/DESIGN.md and a link outside [it](../../../../x.md).',
      '',
    ].join('\n')
    expect(at('packages/a/dist/index.js', code)).toBe(code)
  })

  it('returns the code unchanged when nothing is cited', () => {
    const code = '/** A plain comment. */\nexport const a = 1\n'
    expect(at('packages/a/dist/index.js', code)).toBe(code)
  })
})
