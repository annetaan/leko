import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { classicProgram } from './classic.js'
import { packages } from './package.js'
import { scan, type ScanResult } from './scan.js'

const FIXTURE = fileURLToPath(new URL('../fixtures/app/tsconfig.json', import.meta.url))
const SPELLINGS = fileURLToPath(new URL('../fixtures/spellings/tsconfig.json', import.meta.url))

const fixtureProgram = (tsconfig = FIXTURE): ts.Program => {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfig,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      },
    },
  )
  if (!parsed) throw new Error(`could not read ${tsconfig}`)
  return ts.createProgram(parsed.fileNames, parsed.options)
}

const result: ScanResult = scan([classicProgram(ts, fixtureProgram())], packages())
const names = result.signals.map((signal) => signal.name)

describe('scan', () => {
  it('finds a name written at the call site', () => {
    expect(names).toContain('order-saved')
  })

  it('finds a name kept in a constant', () => {
    expect(names).toContain('report-exported')
  })

  it('finds every arm when the argument is narrowed to several names', () => {
    expect(names).toContain('invoice-mailed')
    expect(names).toContain('invoice-printed')
  })

  it('ignores a reached method that belongs to somebody else', () => {
    // `fixtures/app/src/impostor.ts` has its own class called Leko.
    expect(names).not.toContain('not-a-signal')
  })

  it('counts a Leko by the package that declares it', () => {
    const lookup = packages()
    const packageOf = (file: string): string | undefined =>
      file.endsWith('impostor.ts') ? '@annetaan/leko' : lookup(file)
    const counted = scan([classicProgram(ts, fixtureProgram())], packageOf)
    expect(counted.signals.map((signal) => signal.name)).toContain('not-a-signal')
  })

  it('reports a call whose name it cannot read rather than dropping it', () => {
    expect(result.unread).toHaveLength(1)
    expect(result.unread[0]?.file).toMatch(/dynamic\.ts$/)
    expect(result.unread[0]?.line).toBe(5)
  })

  it('sorts the names, so the same project emits the same file', () => {
    expect(names).toEqual(names.toSorted())
  })

  it('says where each name is reported from', () => {
    const site = result.signals.find((signal) => signal.name === 'order-saved')?.sites[0]
    expect(site?.file).toMatch(/checkout\.ts$/)
    expect(site?.line).toBe(8)
  })

  it('walks a file two programs both hold only once', () => {
    const twice = scan(
      [classicProgram(ts, fixtureProgram()), classicProgram(ts, fixtureProgram())],
      packages(),
    )
    expect(twice).toEqual(result)
    expect(twice.unread).toHaveLength(1)
    expect(twice.signals.find((signal) => signal.name === 'order-saved')?.sites).toHaveLength(1)
  })
})

describe('scan, over every way of spelling reached', () => {
  const program = fixtureProgram(SPELLINGS)
  const spelled = scan([classicProgram(ts, program)], packages())

  it('reports reached through brackets, parentheses, call, apply, bind or destructuring as unread, and gathers none of their names', () => {
    // A fixture that does not compile would prove nothing about the spellings.
    expect(ts.getPreEmitDiagnostics(program)).toEqual([])
    expect(spelled.unread.map((site) => site.file)).toEqual(
      Array.from({ length: 7 }, () => expect.stringMatching(/spellings\.ts$/)),
    )
    expect(spelled.unread.map((site) => site.line)).toEqual([7, 9, 10, 11, 12, 14, 17])
    expect(spelled.signals.filter((signal) => signal.name.startsWith('by-'))).toEqual([])
  })

  it('still gathers leko.reached and leko?.reached', () => {
    expect(spelled.signals.map((signal) => signal.name)).toEqual(['direct', 'optional'])
  })
})
