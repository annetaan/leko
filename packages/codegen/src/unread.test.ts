import { describe, expect, it } from 'vitest'

import type { Site } from './scan.js'
import { changed, message, news, type Told, untold } from './unread.js'

const at = (file: string, line: number): Site => ({ file, line })

describe('message', () => {
  it('says nothing for a project with no unread call', () => {
    expect(message([], { from: '/app', remedy: 'run with --loose' })).toEqual([])
  })

  it("words the command's message exactly as before", () => {
    const strict = { from: '/app', remedy: 'run with --loose' }
    expect(message([at('/app/src/a.ts', 5)], strict).join('\n')).toBe(
      '1 reached() call reports a name this scan cannot read.\n' +
        'The vocabulary is missing whatever it reports, so run with --loose or name it by hand:\n' +
        '\n' +
        '  src/a.ts:5',
    )
    expect(message([at('/app/src/a.ts', 5), at('/app/src/b.ts', 9)], strict).join('\n')).toBe(
      '2 reached() calls report a name this scan cannot read.\n' +
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
    expect(news(untold, { dynamic: one, included: true }).say.unread).toBe(true)
  })

  it('says nothing on a first report with no unread call', () => {
    expect(news(untold, { dynamic: [], included: true }).say).toEqual({
      outside: false,
      unread: false,
    })
  })

  it('tells them again only when changed says they differ', () => {
    const told: Told = { dynamic: one, outside: false }
    expect(news(told, { dynamic: one, included: true }).say.unread).toBe(false)
    expect(news(told, { dynamic: [at('/app/src/a.ts', 8)], included: true }).say.unread).toBe(false)
    expect(
      news(told, { dynamic: [...one, at('/app/src/a.ts', 9)], included: true }).say.unread,
    ).toBe(true)
  })

  it('says nothing when the last unread call goes away', () => {
    const told: Told = { dynamic: one, outside: false }
    expect(news(told, { dynamic: [], included: true }).say.unread).toBe(false)
  })

  it('tells outside once, and again only after it was back inside', () => {
    let told = untold
    const said = [false, false, true, false].map((included) => {
      const next = news(told, { dynamic: [], included })
      told = next.told
      return next.say.outside
    })
    expect(said).toEqual([true, false, false, true])
  })

  it('carries the calls and placement into the next Told', () => {
    expect(news(untold, { dynamic: one, included: false }).told).toEqual({
      dynamic: one,
      outside: true,
    })
  })
})
