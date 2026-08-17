import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { scan, type ScanResult } from './scan.js'

const FIXTURE = fileURLToPath(new URL('../fixtures/app/tsconfig.json', import.meta.url))

const scanFixture = (): ScanResult => {
  const parsed = ts.getParsedCommandLineOfConfigFile(FIXTURE, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    },
  } as ts.ParseConfigFileHost)
  if (!parsed) throw new Error(`could not read ${FIXTURE}`)
  return scan(ts.createProgram(parsed.fileNames, parsed.options), ts)
}

const result = scanFixture()
const names = result.signals.map((signal) => signal.name)

describe('scan', () => {
  it('finds a name written at the call site', () => {
    expect(names).toContain('order-saved')
  })

  it('finds a name kept in a constant', () => {
    // The point of asking the checker instead of the syntax. `reached()` is
    // handed an identifier here and the name is a file away.
    expect(names).toContain('report-exported')
  })

  it('finds every arm when the argument is narrowed to several names', () => {
    expect(names).toContain('invoice-mailed')
    expect(names).toContain('invoice-printed')
  })

  it('ignores a reached method that belongs to somebody else', () => {
    // `fixtures/app/src/impostor.ts` has its own class called Leko. Matching on
    // the name alone would put this string in the vocabulary.
    expect(names).not.toContain('not-a-signal')
  })

  it('reports a call whose name it cannot read rather than dropping it', () => {
    expect(result.dynamic).toHaveLength(1)
    expect(result.dynamic[0]?.file).toMatch(/dynamic\.ts$/)
    expect(result.dynamic[0]?.line).toBe(5)
  })

  it('sorts the names, so the same project emits the same file', () => {
    expect(names).toEqual(names.toSorted())
  })

  it('says where each name is reported from', () => {
    const site = result.signals.find((signal) => signal.name === 'order-saved')?.sites[0]
    expect(site?.file).toMatch(/checkout\.ts$/)
    expect(site?.line).toBe(8)
  })
})
