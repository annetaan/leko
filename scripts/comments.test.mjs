import { describe, expect, it } from 'vitest'

import { passages, prose, strip } from './comments.mjs'

describe('strip', () => {
  it('takes a line comment out and leaves the line', () => {
    expect(strip('const a = 1 // why\n')).toBe('const a = 1')
  })

  it('takes a block comment out and leaves no blank line behind', () => {
    expect(strip('/*\n * why\n */\nconst a = 1\n')).toBe('const a = 1')
  })

  it('keeps a regex literal that holds a slash pair', () => {
    // `packages/leko/tsdown.config.ts` has one. A scanner that reads the `//`
    // inside it as a comment cuts the line short, and cuts every version of
    // the line to the same thing — so a pattern added to the list reads as no
    // change at all.
    const one = 'export default { alwaysBundle: [/^@annetaan\\//] }'
    const two = 'export default { alwaysBundle: [/^@annetaan\\//, /^other/] }'
    expect(strip(one, 'tsdown.config.ts')).toBe(one)
    expect(strip(one, 'tsdown.config.ts')).not.toBe(strip(two, 'tsdown.config.ts'))
  })

  it('keeps what a template literal holds across lines', () => {
    // Blank lines and trailing spaces go with the comments everywhere else,
    // and here they are characters of a value: dropping them answered *code
    // identical* to 25 real edits, all of them in the CSS a sandbox case
    // writes in a template.
    const source = 'const s = `\n  see http://example.com/x\n\n  two   \n`\nconst after = 3'
    expect(strip(source)).toBe(source)
    expect(strip(source)).not.toBe(
      strip('const s = `\n  see http://example.com/x\n  two\n`\nconst after = 3'),
    )
  })

  it('keeps the code after a template literal that holds an unclosed block', () => {
    // A sandbox case writes CSS in one, comments and all.
    const source = 'const css = `\n  a { color: red } /* one\n`\nfunction real() { return 1 }'
    expect(strip(source)).toBe(source)
  })

  it('keeps a comment marker inside a string', () => {
    expect(strip('const s = "// not a comment"')).toBe('const s = "// not a comment"')
  })
})

describe('passages', () => {
  it('reads a run of line comments as one, so a citation may wrap', () => {
    expect(passages('// one\n// two\nconst a = 1\n')).toEqual(['one two'])
  })

  it('reads comments with code between them as two', () => {
    // A sentence cannot run from one to the other, and a citation read across
    // the gap is a heading nobody wrote.
    expect(passages('// one\nconst a = 1\n// two\n')).toEqual(['one', 'two'])
  })
})

describe('prose', () => {
  it('gathers every comment and drops the shape', () => {
    expect(prose('/*\n * why\n */\nconst a = 1 // and why not\n')).toBe('why and why not')
  })

  it('gathers a comment nested in a template literal', () => {
    expect(prose('const s = `a ${/* why */ 1} b`\n')).toBe('why')
  })

  it('reads nothing out of a template literal that holds a comment marker', () => {
    expect(prose('const css = `\n  a { color: red } /* one */\n`\n')).toBe('')
  })
})
