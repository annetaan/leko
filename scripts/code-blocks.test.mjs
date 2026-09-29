import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { blocks, compiler, projects } from './code-blocks.mjs'

const ROOT = fileURLToPath(new URL('../docs/code-blocks', import.meta.url))

/** A page from its lines, so a test can say which page line a block is on. */
const page = (...lines) => lines.join('\n')

const compile = compiler(ROOT)

/** The findings for each code block on the page, block by block. */
const check = (markdown, using = compile) => projects(blocks(markdown)).map(using)

describe('blocks', () => {
  it('reads each ts and tsx block with its page line and the heading above it', () => {
    const found = blocks(
      page(
        '```ts',
        'const a = 1',
        '```',
        '## First',
        '',
        '```tsx',
        'const b = <p />',
        'const c = 2',
        '```',
      ),
    )
    expect(found).toEqual([
      { line: 2, heading: undefined, lang: 'ts', code: 'const a = 1', kind: 'code' },
      {
        line: 7,
        heading: 'First',
        lang: 'tsx',
        code: 'const b = <p />\nconst c = 2',
        kind: 'code',
      },
    ])
  })

  it('leaves out blocks in other languages, and a heading inside a fence', () => {
    const found = blocks(
      page(
        '## Outside',
        '```sh',
        '# not a heading',
        '```',
        '```md',
        '## Nor this',
        '```',
        '```ts',
        'x',
        '```',
      ),
    )
    expect(found.map(({ line, heading }) => ({ line, heading }))).toEqual([
      { line: 9, heading: 'Outside' },
    ])
  })

  it('takes the language from the first word of the info string', () => {
    const found = blocks(
      page(
        '```ts ins="a"',
        'a',
        '```',
        '```tsx title="x.ts"',
        'b',
        '```',
        '```typescript',
        'c',
        '```',
      ),
    )
    expect(found.map(({ lang }) => lang)).toEqual(['ts', 'tsx'])
  })

  it('reads signature and fragment from a bare word, not from one inside a quoted value', () => {
    const found = blocks(
      page(
        '```ts signature',
        'a',
        '```',
        '```ts fragment',
        'b',
        '```',
        '```ts title="a signature"',
        'c',
        '```',
        "```ts ins='fragment'",
        'd',
        '```',
      ),
    )
    expect(found.map(({ kind }) => kind)).toEqual(['signature', 'fragment', 'code', 'code'])
  })

  it('takes a path only from a first line that is a comment holding a path and nothing else', () => {
    const first = (line) => blocks(page('```ts', line, 'x', '```'))[0].path
    expect(first('// src/tour.ts')).toBe('src/tour.ts')
    expect(first('// src/App.tsx')).toBe('src/App.tsx')
    expect(first('// src/leko-signals.d.ts')).toBe('src/leko-signals.d.ts')
    expect(first('// src/tour.ts, the instance')).toBeUndefined()
    expect(first('// src/tour.ts ')).toBeUndefined()
    expect(first('// in the component that owns the ref')).toBeUndefined()
    expect(first('// ../outside.ts')).toBeUndefined()
    expect(first('// /absolute.ts')).toBeUndefined()
    expect(first('// src/style.css')).toBeUndefined()
    expect(blocks(page('```ts', 'x', '// src/tour.ts', '```'))[0].path).toBeUndefined()
  })

  it('attaches a prelude comment to the block after it, across blank lines', () => {
    const [block] = blocks(
      page(
        '## Here',
        '{/* prelude',
        'declare const order: string',
        '*/}',
        '',
        '',
        '```ts',
        'order',
        '```',
      ),
    )
    expect(block.prelude).toEqual({ line: 3, code: 'declare const order: string' })
    expect(block.line).toBe(8)
  })

  it('throws on a prelude with no unmarked ts or tsx block after it', () => {
    const prelude = ['{/* prelude', 'declare const a: 1', '*/}']
    expect(() => blocks(page(...prelude))).toThrow()
    expect(() => blocks(page(...prelude, 'Some prose.', '```ts', 'a', '```'))).toThrow()
    expect(() => blocks(page(...prelude, '```sh', 'a', '```'))).toThrow()
    expect(() => blocks(page(...prelude, '```ts signature', 'a', '```'))).toThrow()
    expect(() => blocks(page(...prelude, '```ts fragment', 'a', '```'))).toThrow()
    expect(() => blocks(page('{/* prelude', 'a */ b', '*/}', '```ts', 'a', '```'))).toThrow()
  })
})

describe('projects', () => {
  it('lets a block see each earlier block that names a path, the latest at each path', () => {
    const [, , third] = projects(
      blocks(
        page(
          '```ts',
          '// src/a.ts',
          'export const a = 1',
          '```',
          '```ts',
          '// src/a.ts',
          'export const a = 2',
          '```',
          '```ts',
          'a',
          '```',
        ),
      ),
    )
    expect(third.entry).toBe('src/block-3.ts')
    expect(Object.fromEntries(third.files)).toEqual({
      'src/a.ts': '// src/a.ts\nexport const a = 2',
      'src/block-3.ts': 'a',
    })
  })

  it('hides an earlier block without a path, and a signature or a fragment', () => {
    const found = projects(
      blocks(
        page(
          '```ts',
          'const a = 1',
          '```',
          '```ts signature',
          '// src/b.ts',
          'b(): void',
          '```',
          '```ts fragment',
          '// src/c.ts',
          'c,',
          '```',
          '```tsx',
          'd',
          '```',
        ),
      ),
    )
    expect(found.map(({ entry }) => entry)).toEqual(['src/block-1.ts', 'src/block-4.tsx'])
    expect([...found[1].files.keys()]).toEqual(['src/block-4.tsx'])
  })

  it('compiles a .d.ts path as .ts', () => {
    const found = projects(
      blocks(page('```ts', '// src/leko-signals.d.ts', 'export {}', '```', '```ts', 'x', '```')),
    )
    expect(found[0].entry).toBe('src/leko-signals.ts')
    expect([...found[1].files.keys()]).toEqual(['src/leko-signals.ts', 'src/block-2.ts'])
  })

  it('puts the prelude before the block and counts its lines', () => {
    const [project] = projects(
      blocks(
        page(
          '{/* prelude',
          'declare const a: 1',
          'declare const b: 2',
          '*/}',
          '```ts',
          'a + b',
          '```',
        ),
      ),
    )
    expect(project.files.get(project.entry)).toBe('declare const a: 1\ndeclare const b: 2\na + b')
    expect(project.offset).toBe(2)
  })
})

describe('compile', { timeout: 30_000 }, () => {
  it('reads its options from the tsconfig in its root', () => {
    // `strict` is the option the site's project adds, so an implicit any
    // fails there and passes in a project that turns it off.
    const markdown = page('```ts', 'export function f(x) {', '  return x', '}', '```')
    expect(check(markdown)[0].map(({ code }) => code)).toEqual([7006])

    const loose = mkdtempSync(join(tmpdir(), 'code-blocks-'))
    try {
      writeFileSync(
        join(loose, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: false, noEmit: true, types: [] } }),
      )
      // A tsconfig that finds no file of its own is an error of its own.
      writeFileSync(join(loose, 'empty.ts'), 'export {}\n')
      expect(check(markdown, compiler(loose))).toEqual([[]])
    } finally {
      rmSync(loose, { recursive: true })
    }
  })

  it('passes a block that uses the instance without importing it', () => {
    expect(check(page('```ts', "leko.reached('order-saved')", 'leko.stop()', '```'))).toEqual([[]])
  })

  it('puts a block named src/tour.ts in place of the one on disk', () => {
    const importing = [
      '```ts',
      "import { extra } from './tour'",
      'export const n: number = extra',
      '```',
    ]
    const [unreplaced] = check(page(...importing))
    expect(unreplaced.map(({ code }) => code)).toEqual([2305])

    const replacing = [
      '```ts',
      '// src/tour.ts',
      "import { createLeko } from '@annetaan/leko'",
      'export const leko = createLeko()',
      'export const extra = 1',
      '```',
    ]
    expect(check(page(...replacing, ...importing))).toEqual([[], []])
  })

  it('fails a call to a method Leko does not have, at the page line of the call', () => {
    const [found] = check(
      page('## Report', '', '```ts', 'const saved = true', "leko.reachd('saved')", '```'),
    )
    expect(found).toEqual([expect.objectContaining({ line: 5, prelude: false, code: 2551 })])
  })

  it('fails a step that marks a later region interactive', () => {
    const [found] = check(
      page(
        '```ts',
        "import type { LekoStep } from '@annetaan/leko'",
        '',
        'const step: LekoStep = {',
        "  id: 'two',",
        "  target: [{ elements: '#a' }, { elements: '#b', interactive: true }],",
        "  message: 'Two regions.',",
        '}',
        '```',
      ),
    )
    expect(found.map(({ line, code }) => ({ line, code }))).toEqual([{ line: 6, code: 2322 }])
  })

  it("reports a diagnostic in the prelude as the prelude's", () => {
    const [found] = check(
      page(
        '{/* prelude',
        'declare const a: number',
        'declare const order: Order',
        '*/}',
        '```ts',
        'a',
        '```',
      ),
    )
    expect(found).toEqual([expect.objectContaining({ line: 3, prelude: true, code: 2304 })])
  })

  it("resolves an import of an earlier block's path", () => {
    const found = check(
      page(
        '```ts',
        '// src/stories.ts',
        "import type { LekoStory } from '@annetaan/leko'",
        '',
        "export const welcome = { id: 'welcome', steps: [] } satisfies LekoStory",
        '```',
        '```ts',
        "import { welcome } from './stories'",
        '',
        'leko.start(welcome)',
        '```',
      ),
    )
    expect(found).toEqual([[], []])
  })

  it("lets a block's own leko shadow the global one", () => {
    expect(check(page('```ts', 'const leko = 42', 'export const n: number = leko', '```'))).toEqual(
      [[]],
    )
  })
})
