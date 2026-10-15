import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResolvedConfig } from 'vite'
import { describe, expect, it } from 'vitest'

import { generate, type Options } from './generate.js'
import { lekoSignals } from './vite.js'

const project = fileURLToPath(new URL('../fixtures/app', import.meta.url))
const solution = fileURLToPath(new URL('../fixtures/solution', import.meta.url))
// Outside the fixture, so the file is never included and both warnings fire.
const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'leko-codegen-')), 'signals.d.ts')

const unread = (warnings: string[]): string[] => warnings.filter((w) => w.includes('cannot read'))
const outside = (warnings: string[]): string[] =>
  warnings.filter((w) => w.includes('is outside the project'))

const plugin = (options: Options) => {
  const warnings: string[] = []
  const hooks = lekoSignals(options)
  const config = { root: project, logger: { warn: (text: string) => warnings.push(text) } }
  ;(hooks.configResolved as unknown as (config: ResolvedConfig) => void)(
    config as unknown as ResolvedConfig,
  )
  return {
    warnings,
    buildStart: hooks.buildStart as unknown as () => void,
    configureServer: hooks.configureServer as unknown as () => void,
    closeBundle: hooks.closeBundle as unknown as () => void,
  }
}

describe('lekoSignals', () => {
  it('reports the calls it could not read when a build starts', () => {
    const { warnings, buildStart } = plugin({ project, out: scratch() })
    buildStart()
    expect(unread(warnings)).toHaveLength(1)
    expect(unread(warnings)[0]).toContain('src/dynamic.ts:5')
  })

  it('reports them when the dev server starts with the file already current', () => {
    const out = scratch()
    generate({ project, out })
    const { warnings, configureServer, closeBundle } = plugin({ project, out })
    try {
      configureServer()
      expect(unread(warnings)).toHaveLength(1)
      expect(unread(warnings)[0]).toContain('src/dynamic.ts:5')
    } finally {
      closeBundle()
    }
  })

  it('says nothing again when a build reads the same calls again', () => {
    const { warnings, buildStart } = plugin({ project, out: scratch() })
    buildStart()
    buildStart()
    expect(unread(warnings)).toHaveLength(1)
  })

  it('names strict: false, and only naming by hand when it is already loose', () => {
    const strict = plugin({ project, out: scratch() })
    strict.buildStart()
    expect(unread(strict.warnings)[0]).toContain('so pass strict: false or name it by hand:')

    const loose = plugin({ project, out: scratch(), strict: false })
    loose.buildStart()
    expect(unread(loose.warnings)[0]).toContain('so name it by hand:')
    expect(unread(loose.warnings)[0]).not.toContain('strict: false')
  })

  it('says once that the file is outside the project, current or not', () => {
    const out = scratch()
    generate({ project, out })
    const dev = plugin({ project, out })
    try {
      dev.configureServer()
      expect(outside(dev.warnings)).toHaveLength(1)
      expect(outside(dev.warnings)[0]).toContain('the tsconfig that compiles your stories')
    } finally {
      dev.closeBundle()
    }

    const build = plugin({ project, out: scratch() })
    build.buildStart()
    build.buildStart()
    expect(outside(build.warnings)).toHaveLength(1)
  })

  it('writes the vocabulary of every referenced project when a build starts', () => {
    const out = scratch()
    plugin({ project: solution, out }).buildStart()
    const written = readFileSync(out, 'utf8')
    expect(written).toContain('order-saved')
    expect(written).toContain('demo-seeded')
  })
})
