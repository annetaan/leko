import { describe, expect, test } from 'vitest'

import { decode, encode, HANDOFF_KEY, type Kept } from './handoff.js'

// No page at all: `leko.test.ts` and `wiring.test.ts` drive a real document.
// This is text in and text out.

describe('encode/decode', () => {
  test('encode then decode gives back the handoff and the from it was kept with', () => {
    const kept: Kept = {
      handoff: { url: { source: '^/demo', flags: '' }, into: 'demo' },
      from: '/start',
    }
    expect(decode(encode(kept))).toEqual(kept)
  })

  test('decode answers undefined for null', () => {
    expect(decode(null)).toBeUndefined()
  })

  test('decode answers undefined for text that is not JSON', () => {
    expect(decode('not json')).toBeUndefined()
  })

  test('decode answers undefined for JSON that is not an object', () => {
    expect(decode('"a string"')).toBeUndefined()
    expect(decode('42')).toBeUndefined()
    expect(decode('[1, 2, 3]')).toBeUndefined()
    expect(decode('null')).toBeUndefined()
  })

  test('decode answers undefined where from, source, flags or into is missing', () => {
    expect(decode(JSON.stringify({ source: '^/demo', flags: '', into: 'demo' }))).toBeUndefined()
    expect(decode(JSON.stringify({ from: '/start', flags: '', into: 'demo' }))).toBeUndefined()
    expect(
      decode(JSON.stringify({ from: '/start', source: '^/demo', into: 'demo' })),
    ).toBeUndefined()
    expect(decode(JSON.stringify({ from: '/start', source: '^/demo', flags: '' }))).toBeUndefined()
  })

  test('decode answers undefined where any of the four is not a string', () => {
    expect(
      decode(JSON.stringify({ from: 1, source: '^/demo', flags: '', into: 'demo' })),
    ).toBeUndefined()
    expect(
      decode(JSON.stringify({ from: '/start', source: 1, flags: '', into: 'demo' })),
    ).toBeUndefined()
    expect(
      decode(JSON.stringify({ from: '/start', source: '^/demo', flags: 1, into: 'demo' })),
    ).toBeUndefined()
    expect(
      decode(JSON.stringify({ from: '/start', source: '^/demo', flags: '', into: 1 })),
    ).toBeUndefined()
  })

  test('decode answers undefined for a pattern that does not construct', () => {
    expect(
      decode(JSON.stringify({ from: '/start', source: '(', flags: '', into: 'demo' })),
    ).toBeUndefined()
    expect(
      decode(JSON.stringify({ from: '/start', source: '^/demo', flags: 'q', into: 'demo' })),
    ).toBeUndefined()
  })

  test('decode keeps flags as written, g and y included', () => {
    const kept: Kept = {
      handoff: { url: { source: '^/demo', flags: 'gy' }, into: 'demo' },
      from: '/start',
    }
    expect(decode(encode(kept))?.handoff.url.flags).toBe('gy')
  })

  test('HANDOFF_KEY is one fixed string', () => {
    expect(HANDOFF_KEY).toBe('leko.handoff')
  })
})
