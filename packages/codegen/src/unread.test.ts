import { describe, expect, it } from 'vitest'

import type { Site } from './scan.js'
import { changed, message, news, say, type Told, untold } from './unread.js'

const at = (file: string, line: number): Site => ({ file, line })

describe('message', () => {
  it('says nothing for a project with no unread call', () => {
    expect(message([], { from: '/app', remedy: 'run with --loose' })).toEqual([])
  })

  it("words the command's message exactly as before", () => {
    const strict = { from: '/app', remedy: 'run with --loose' }
    expect(message([at('/app/src/a.ts', 5)], strict).join('\n')).toBe(
      '1 use of reached() reports a name this scan cannot read.\n' +
        'The vocabulary is missing whatever it reports, so run with --loose or name it by hand:\n' +
        '\n' +
        '  src/a.ts:5',
    )
    expect(message([at('/app/src/a.ts', 5), at('/app/src/b.ts', 9)], strict).join('\n')).toBe(
      '2 uses of reached() report a name this scan cannot read.\n' +
        'The vocabulary is missing whatever they report, so run with --loose or name them by hand:\n' +
        '\n' +
        '  src/a.ts:5\n' +
        '  src/b.ts:9',
    )
  })

  it('lists each call relative to the directory it is given', () => {
    const lines = message([at('/app/src/a.ts', 5), at('/lib/b.ts', 2)], {
      from: '/app/src',
      remedy: 'pass strict: false',
    })
    expect(lines.slice(3)).toEqual(['  a.ts:5', '  ../../lib/b.ts:2'])
  })

  it('offers only naming by hand when there is no remedy', () => {
    const lines = message([at('/app/src/a.ts', 5)], { from: '/app', remedy: null })
    expect(lines[1]).toBe('The vocabulary is missing whatever it reports, so name it by hand:')
    const two = message([at('/app/src/a.ts', 5), at('/app/src/a.ts', 7)], {
      from: '/app',
      remedy: null,
    })
    expect(two[1]).toBe('The vocabulary is missing whatever they report, so name them by hand:')
  })
})

describe('changed', () => {
  it('calls a list changed when a call is added or removed', () => {
    const one = [at('/app/src/a.ts', 5)]
    const two = [at('/app/src/a.ts', 5), at('/app/src/a.ts', 9)]
    expect(changed(one, two)).toBe(true)
    expect(changed(two, one)).toBe(true)
    expect(changed([], one)).toBe(true)
    expect(changed(one, [])).toBe(true)
  })

  it('calls a list unchanged when only a line moved', () => {
    expect(changed([at('/app/src/a.ts', 5)], [at('/app/src/a.ts', 8)])).toBe(false)
  })

  it('calls a list changed when a call moves to another file', () => {
    expect(changed([at('/app/src/a.ts', 5)], [at('/app/src/b.ts', 5)])).toBe(true)
  })
})

describe('news', () => {
  const one = [at('/app/src/a.ts', 5)]

  it('tells the calls it could not read on the first report', () => {
    expect(news(untold, { unread: one, included: true }).say.unread).toBe(true)
  })

  it('says nothing on a first report with no unread call', () => {
    expect(news(untold, { unread: [], included: true }).say).toEqual({
      outside: false,
      unread: false,
    })
  })

  it('tells them again only when changed says they differ', () => {
    const told: Told = { unread: one, outside: false }
    expect(news(told, { unread: one, included: true }).say.unread).toBe(false)
    expect(news(told, { unread: [at('/app/src/a.ts', 8)], included: true }).say.unread).toBe(false)
    expect(
      news(told, { unread: [...one, at('/app/src/a.ts', 9)], included: true }).say.unread,
    ).toBe(true)
  })

  it('says nothing when the last unread call goes away', () => {
    const told: Told = { unread: one, outside: false }
    expect(news(told, { unread: [], included: true }).say.unread).toBe(false)
  })

  it('tells outside once, and again only after it was back inside', () => {
    let told = untold
    const said = [false, false, true, false].map((included) => {
      const next = news(told, { unread: [], included })
      told = next.told
      return next.say.outside
    })
    expect(said).toEqual([true, false, false, true])
  })

  it('carries the calls and placement into the next Told', () => {
    expect(news(untold, { unread: one, included: false }).told).toEqual({
      unread: one,
      outside: true,
    })
  })

  it('says nothing about inclusion while the file is not on disk', () => {
    const told: Told = { unread: [], outside: true }
    const next = news(told, { unread: [], included: undefined })
    expect(next.say.outside).toBe(false)
    expect(next.told.outside).toBe(true)
    expect(news(untold, { unread: [], included: undefined }).told.outside).toBe(false)
  })
})

describe('say', () => {
  it('say gives the outside text and the unread text, in one wording whatever the front end', () => {
    const { told, warnings } = say(
      untold,
      { out: '/app/src/signals.d.ts', unread: [at('/app/src/a.ts', 5)], included: false },
      { from: '/app', remedy: 'run with --loose', elsewhere: 'move it' },
    )
    expect(warnings).toEqual([
      'src/signals.d.ts is outside the project, so nothing compiles it and no completion\n' +
        'ever appears. Add it to the include of\n' +
        'the tsconfig that compiles your stories, or move it.',
      message([at('/app/src/a.ts', 5)], { from: '/app', remedy: 'run with --loose' }).join('\n'),
    ])
    expect(told).toEqual({ unread: [at('/app/src/a.ts', 5)], outside: true })
    expect(warnings[1]).toContain('run with --loose or name it by hand')
  })
})
