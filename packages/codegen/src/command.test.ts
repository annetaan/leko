import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { run } from './command.js'
import { generate } from './generate.js'

const project = fileURLToPath(new URL('../fixtures/app', import.meta.url))
const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'leko-codegen-')), 'signals.d.ts')

const text = (args: unknown[]): string => args.map(String).join(' ')

const io = () => {
  const log: string[] = []
  const warn: string[] = []
  const error: string[] = []
  return {
    log,
    warn,
    error,
    io: {
      log: (...args: unknown[]) => void log.push(text(args)),
      warn: (...args: unknown[]) => void warn.push(text(args)),
      error: (...args: unknown[]) => void error.push(text(args)),
    },
  }
}

describe('run', () => {
  it('prints the reason and exits 2 when there is no tsconfig, with no stack trace', () => {
    const empty = mkdtempSync(join(tmpdir(), 'leko-codegen-'))
    const got = io()
    expect(run(['--project', empty], got.io)).toBe(2)
    expect(got.error.join('\n')).toContain('tsconfig.json')
    expect(got.error.join('\n')).not.toMatch(/^\s+at /m)
  })

  it('says the file is up to date, not wrote, when nothing was written', () => {
    const out = scratch()
    generate({ project, out })
    const got = io()
    expect(run(['--project', project, '--out', out], got.io)).toBe(0)
    expect(got.log.join('\n')).toContain('is up to date')
    expect(got.log.join('\n')).not.toContain('wrote')
  })

  it('returns 0 from a plain run that wrote', () => {
    const got = io()
    expect(run(['--project', project, '--out', scratch()], got.io)).toBe(0)
    expect(got.log.join('\n')).toContain('wrote')
  })

  it('--check on a missing file fails as out of date and says nothing about the project including it', () => {
    const out = join(project, 'src', 'missing', 'signals.d.ts')
    const got = io()
    expect(run(['--project', project, '--out', out, '--check'], got.io)).toBe(1)
    expect(got.error.join('\n')).toContain('is out of date')
    expect(got.warn.filter((w) => w.includes('is outside the project'))).toEqual([])
  })
})
