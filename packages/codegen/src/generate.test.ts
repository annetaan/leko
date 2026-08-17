import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { generate, inspect } from './generate.js'

const project = fileURLToPath(new URL('../fixtures/app', import.meta.url))
const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'leko-codegen-')), 'signals.d.ts')

describe('generate', () => {
  it('writes a file holding what the project reports', () => {
    const out = scratch()
    generate({ project, out })
    expect(readFileSync(out, 'utf8')).toContain("'order-saved': true")
  })

  it('calls a missing file stale, and a freshly written one current', () => {
    const out = scratch()
    expect(generate({ project, out }).stale).toBe(true)
    expect(generate({ project, out }).stale).toBe(false)
  })

  it('leaves the file alone when nothing changed', () => {
    // A watcher that rewrites the file it is watching never stops.
    const out = scratch()
    generate({ project, out })
    const before = readFileSync(out, 'utf8')
    writeFileSync(out, before, 'utf8')
    expect(generate({ project, out }).stale).toBe(false)
  })

  it('notices a file that has fallen behind', () => {
    const out = scratch()
    generate({ project, out })
    writeFileSync(out, '// somebody edited this\n', 'utf8')
    expect(inspect({ project, out }).stale).toBe(true)
  })

  it('writes nothing under inspect, which is what --check runs', () => {
    const out = scratch()
    const report = inspect({ project, out })
    expect(report.stale).toBe(true)
    expect(() => readFileSync(out, 'utf8')).toThrow()
  })

  it('defaults the output to leko-signals.d.ts beside the tsconfig', () => {
    expect(inspect({ project }).out).toBe(join(project, 'leko-signals.d.ts'))
  })

  it('says when the file it wrote is outside the project', () => {
    // The failure this catches is silent otherwise. A declaration file nobody
    // compiles augments nothing, and no error anywhere says so.
    expect(generate({ project, out: scratch() }).included).toBe(false)
  })

  it('says when the file it wrote is inside the project', () => {
    const out = join(project, 'src', 'generated.d.ts')
    try {
      expect(generate({ project, out }).included).toBe(true)
    } finally {
      rmSync(out, { force: true })
    }
  })
})
