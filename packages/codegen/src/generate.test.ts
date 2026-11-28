import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

import { generate, inspect, type Report, watch } from './generate.js'

const project = fileURLToPath(new URL('../fixtures/app', import.meta.url))
const solution = fileURLToPath(new URL('../fixtures/solution', import.meta.url))
const scratch = (): string => join(mkdtempSync(join(tmpdir(), 'leko-codegen-')), 'signals.d.ts')
const names = (report: Report): string[] => report.result.signals.map((signal) => signal.name)
const editable = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'leko-codegen-'))
  const write = (path: string, text: string): void => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text, 'utf8')
  }
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['src'],
    }),
  )
  write(
    'node_modules/@annetaan/leko/package.json',
    JSON.stringify({ name: '@annetaan/leko', types: './index.d.ts' }),
  )
  write(
    'node_modules/@annetaan/leko/index.d.ts',
    [
      'declare class Leko {',
      '  reached(name: string): void',
      '}',
      'export type { Leko }',
      'export declare function createLeko(): Leko',
      '',
    ].join('\n'),
  )
  write('src/main.ts', reporting('first'))
  return root
}
const reporting = (...signals: readonly string[]): string =>
  [
    "import { createLeko } from '@annetaan/leko'",
    'const leko = createLeko()',
    ...signals.map((name) => `leko.reached('${name}')`),
    '',
  ].join('\n')
const tsconfig = (json: object): string => {
  const dir = mkdtempSync(join(tmpdir(), 'leko-codegen-'))
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(json), 'utf8')
  return dir
}

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

  it('calls a file current that differs only in CRLF line endings', () => {
    const out = scratch()
    generate({ project, out })
    writeFileSync(out, readFileSync(out, 'utf8').replaceAll('\n', '\r\n'), 'utf8')
    expect(inspect({ project, out }).stale).toBe(false)
  })

  it('leaves a CRLF file as it is rather than rewriting it', () => {
    const out = scratch()
    generate({ project, out })
    const crlf = readFileSync(out, 'utf8').replaceAll('\n', '\r\n')
    writeFileSync(out, crlf, 'utf8')
    expect(generate({ project, out }).stale).toBe(false)
    expect(readFileSync(out, 'utf8')).toBe(crlf)
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

  it('inspect leaves included undefined for a file that is not on disk', () => {
    expect(inspect({ project, out: join(project, 'src', 'absent.d.ts') }).included).toBeUndefined()
  })

  it.skipIf(ts.sys.useCaseSensitiveFileNames)(
    'counts an out written in another case as inside on a filesystem that ignores case',
    () => {
      try {
        expect(generate({ project, out: join(project, 'SRC', 'generated.d.ts') }).included).toBe(
          true,
        )
      } finally {
        rmSync(join(project, 'src', 'generated.d.ts'), { force: true })
      }
    },
  )
})

describe('references', () => {
  it('reads every project a references-only tsconfig lists', () => {
    const report = inspect({ project: solution, out: scratch() })
    expect(names(report)).toContain('order-saved')
    expect(names(report)).toContain('demo-seeded')
  })

  it('follows a reference given as a directory', () => {
    // demo-seeded lives only behind ./tools, which names no tsconfig.json.
    expect(names(inspect({ project: solution, out: scratch() }))).toContain('demo-seeded')
  })

  it('reports a call two referenced projects both compile once', () => {
    const report = inspect({ project: solution, out: scratch() })
    const saved = report.result.signals.find((signal) => signal.name === 'order-saved')
    expect(saved?.sites).toHaveLength(1)
  })

  it('says a file inside a referenced project is included', () => {
    const out = join(solution, 'src', 'generated.d.ts')
    try {
      expect(generate({ project: solution, out }).included).toBe(true)
    } finally {
      rmSync(out, { force: true })
    }
  })

  it('still calls a file outside every referenced project outside', () => {
    expect(generate({ project: solution, out: scratch() }).included).toBe(false)
  })

  it('does not count a project that compiles nothing but the file it wrote', () => {
    const dir = tsconfig({ files: ['signals.d.ts'] })
    expect(generate({ project: dir, out: join(dir, 'signals.d.ts') }).included).toBe(false)
  })

  it('throws naming a referenced tsconfig that does not exist', () => {
    const dir = tsconfig({ files: [], references: [{ path: './tsconfig.gone.json' }] })
    expect(() => inspect({ project: dir, out: scratch() })).toThrow(/tsconfig\.gone\.json/)
  })
})

describe('watch', () => {
  it('calls back on a program that writes nothing, and says it is current', () => {
    const out = scratch()
    generate({ project, out })
    const reports: Report[] = []
    const stop = watch({ project, out }, (report) => reports.push(report))
    try {
      expect(reports).toHaveLength(1)
      expect(reports[0]?.stale).toBe(false)
      expect(reports[0]?.included).toBe(false)
      expect(reports[0]?.result.unread).toHaveLength(1)
    } finally {
      stop()
    }
  })

  it('calls back on the program that writes, and says it was stale', () => {
    const out = scratch()
    const reports: Report[] = []
    const stop = watch({ project, out }, (report) => reports.push(report))
    try {
      expect(reports).toHaveLength(1)
      expect(reports[0]?.stale).toBe(true)
      expect(existsSync(out)).toBe(true)
    } finally {
      stop()
    }
  })

  it('reports once at start across every referenced project, with every name', () => {
    const reports: Report[] = []
    const stop = watch({ project: solution, out: scratch() }, (report) => reports.push(report))
    try {
      expect(reports).toHaveLength(1)
      expect(reports[0]?.stale).toBe(true)
      expect(reports[0]?.content).toContain('order-saved')
      expect(reports[0]?.content).toContain('demo-seeded')
    } finally {
      stop()
    }
  })

  it('rewrites the file when a reached() call is added', async () => {
    const root = editable()
    const out = join(root, 'src', 'leko-signals.d.ts')
    const reports: Report[] = []
    const stop = watch({ project: root, out }, (report) => reports.push(report))
    try {
      expect(readFileSync(out, 'utf8')).toContain("'first': true")
      // Each poll writes again, for the reason `written` in `watcher.test.ts` gives.
      await vi.waitFor(() => {
        writeFileSync(join(root, 'src', 'main.ts'), reporting('first', 'x'), 'utf8')
        expect(readFileSync(out, 'utf8')).toContain("'x': true")
      })
      expect(reports.some((report) => report.stale && names(report).includes('x'))).toBe(true)
    } finally {
      stop()
    }
  })

  it('picks up a new file in a new folder', async () => {
    const root = editable()
    const out = join(root, 'src', 'leko-signals.d.ts')
    const stop = watch({ project: root, out })
    try {
      mkdirSync(join(root, 'src', 'new'))
      await vi.waitFor(() => {
        writeFileSync(join(root, 'src', 'new', 'a.ts'), reporting('fresh'), 'utf8')
        expect(readFileSync(out, 'utf8')).toContain("'fresh': true")
      })
    } finally {
      stop()
    }
  })
})
