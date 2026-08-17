import { describe, expect, it } from 'vitest'

import { emit } from './emit.js'
import type { ScanResult } from './scan.js'

const result = (...names: string[]): ScanResult => ({
  signals: names.map((name) => ({ name, sites: [{ file: '/app/src/checkout.ts', line: 8 }] })),
  dynamic: [],
})

describe('emit', () => {
  it('ends in an export, because a file with none augments nothing', () => {
    // The whole feature fails silently without this line. `declare module` in a
    // file that is not itself a module declares an ambient module, no completion
    // appears, and no error anywhere explains it.
    expect(emit(result('order-saved')).trimEnd()).toMatch(/^export type \w+ = true$/m)
  })

  it('augments the package rather than a path inside it', () => {
    expect(emit(result('order-saved'))).toContain("declare module '@annetaan/leko' {")
  })

  it('writes each name as a key of LekoSignals', () => {
    expect(emit(result('order-saved'))).toContain("'order-saved': true")
  })

  it('promises the vocabulary is complete by default', () => {
    expect(emit(result('order-saved'))).toContain('interface LekoStrict')
  })

  it('makes no such promise under --loose', () => {
    expect(emit(result('order-saved'), { strict: false })).not.toContain('LekoStrict')
  })

  it('still emits a usable file when the project reports nothing', () => {
    // An empty LekoSignals leaves `awaits` as `string`, so a project that has
    // not written its first reached() call is not locked out by its own
    // generated file.
    const empty = emit(result())
    expect(empty).toContain('interface LekoSignals {')
    expect(empty).toMatch(/^export type \w+ = true$/m)
  })

  it('says where a name came from', () => {
    expect(emit(result('order-saved'), { root: '/app' })).toContain('/** src/checkout.ts:8 */')
  })

  it('escapes a quote in a name rather than emitting a broken key', () => {
    const odd = emit({ signals: [{ name: "it's-done", sites: [] }], dynamic: [] })
    expect(odd).toContain("'it\\'s-done': true")
  })

  it('gives the same bytes for the same scan, so --check can compare', () => {
    expect(emit(result('b', 'a'))).toBe(emit(result('b', 'a')))
  })
})
