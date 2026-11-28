import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { classicProgram } from './classic.js'
import { packages } from './package.js'
import { scan } from './scan.js'

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

describe('scan', () => {
  it('counts a Leko by the package that declares it', () => {
    // `fixtures/app/src/impostor.ts` has its own class called Leko.
    const lookup = packages()
    const packageOf = (file: string): string | undefined =>
      file.endsWith('impostor.ts') ? '@annetaan/leko' : lookup(file)
    const counted = scan([classicProgram(ts, fixtureProgram())], packageOf)
    expect(counted.signals.map((signal) => signal.name)).toContain('not-a-signal')
  })

  it('walks a file two programs both hold only once', () => {
    const once = scan([classicProgram(ts, fixtureProgram())], packages())
    const twice = scan(
      [classicProgram(ts, fixtureProgram()), classicProgram(ts, fixtureProgram())],
      packages(),
    )
    expect(twice).toEqual(once)
    expect(twice.unread).toHaveLength(1)
    expect(twice.signals.find((signal) => signal.name === 'order-saved')?.sites).toHaveLength(1)
  })

  it('reads a spellings fixture that compiles', () => {
    // A fixture that does not compile would prove nothing about the spellings.
    expect(ts.getPreEmitDiagnostics(fixtureProgram(SPELLINGS))).toEqual([])
  })
})
