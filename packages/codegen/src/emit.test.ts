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

  it('escapes a quote in a name rather than emitting a broken key', () => {
    const odd = emit({ signals: [{ name: "it's-done", sites: [] }], dynamic: [] })
    expect(odd).toContain("'it\\'s-done': true")
  })

  it('writes the names sorted, whatever order the scan handed them in', () => {
    const file = emit(result('b', 'a'))
    expect(file.indexOf("'a': true")).toBeLessThan(file.indexOf("'b': true"))
    expect(file).toBe(emit(result('a', 'b')))
  })

  it('carries no call sites, so edits that move a line change nothing', () => {
    // `emit.ts` says why the names go in alone. With sites in it, --check failed
    // whenever somebody edited above a reached() call.
    const moved: ScanResult = {
      signals: [{ name: 'order-saved', sites: [{ file: '/app/src/other.ts', line: 99 }] }],
      dynamic: [],
    }
    expect(emit(moved)).toBe(emit(result('order-saved')))
  })
})
