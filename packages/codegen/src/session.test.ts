import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import * as is from 'typescript-7/unstable/ast/is'
import * as sync from 'typescript-7/unstable/sync'
import { afterAll, describe, expect, it } from 'vitest'

import { classic } from './classic.js'
import { classify, type Compiler, type Session } from './compiler.js'
import { native } from './native.js'

const fixture = (name: string): string =>
  fileURLToPath(new URL(`../fixtures/${name}/tsconfig.json`, import.meta.url))

const tempProject = (): string => {
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

const reporting = (...names: readonly string[]): string =>
  [
    "import { createLeko } from '@annetaan/leko'",
    'const leko = createLeko()',
    ...names.map((name) => `leko.reached('${name}')`),
    '',
  ].join('\n')

const named = (session: Session): string[] => session.scan().signals.map((signal) => signal.name)

describe.each<[string, Compiler]>([
  ['classic', classic(ts)],
  ['native', native({ sync, is })],
])('a %s session', (_, compiler) => {
  const sessions: Session[] = []
  const open = (config: string): Session => {
    const session = compiler.open(config)
    sessions.push(session)
    return session
  }
  afterAll(() => {
    for (const session of sessions) session.close()
  })

  describe('over fixtures/app', () => {
    const result = open(fixture('app')).scan()

    it('gathers every name the app reports, sorted, and not the impostor', () => {
      expect(result.signals.map((signal) => signal.name)).toEqual([
        'invoice-mailed',
        'invoice-printed',
        'order-saved',
        'report-exported',
      ])
    })

    it('reports the one call whose name it cannot read', () => {
      const { unread } = result
      expect(unread).toHaveLength(1)
      expect(unread[0]?.file).toMatch(/dynamic\.ts$/)
      expect(unread[0]?.line).toBe(5)
    })

    it('says where each name is reported from', () => {
      const site = result.signals.find((signal) => signal.name === 'order-saved')?.sites[0]
      expect(site?.file).toMatch(/checkout\.ts$/)
      expect(site?.line).toBe(8)
    })
  })

  describe('over fixtures/spellings', () => {
    it('reports every spelling but the direct and optional calls as unread', () => {
      const spelled = open(fixture('spellings')).scan()
      expect(spelled.unread.map((site) => site.file)).toEqual(
        Array.from({ length: 7 }, () => expect.stringMatching(/spellings\.ts$/)),
      )
      expect(spelled.unread.map((site) => site.line)).toEqual([7, 9, 10, 11, 12, 14, 17])
      expect(spelled.signals.map((signal) => signal.name)).toEqual(['direct', 'optional'])
    })
  })

  describe('over fixtures/solution', () => {
    it('reads every referenced project and reports a call both compile once', () => {
      const session = open(fixture('solution'))
      const { signals } = session.scan()
      expect(signals.map((signal) => signal.name)).toEqual(['demo-seeded', 'order-saved'])
      expect(signals.find((signal) => signal.name === 'order-saved')?.sites).toHaveLength(1)
    })

    it('lists the solution and both projects it references', () => {
      const dir = join(fixture('solution'), '..')
      expect(
        open(fixture('solution'))
          .projects()
          .map((project) => project.config),
      ).toEqual([
        join(dir, 'tsconfig.json'),
        join(dir, 'tsconfig.app.json'),
        join(dir, 'tools', 'tsconfig.json'),
      ])
    })
  })

  describe('update', () => {
    const root = tempProject()
    const session = open(join(root, 'tsconfig.json'))
    const added = join(root, 'src', 'added.ts')
    const roots = (): readonly string[] => session.projects().flatMap((project) => project.roots)

    it('gathers the new name in a file that changed', () => {
      expect(named(session)).toEqual(['first'])
      writeFileSync(join(root, 'src', 'main.ts'), reporting('second'), 'utf8')
      session.update({ changed: [join(root, 'src', 'main.ts')], created: [], deleted: [] })
      expect(named(session)).toEqual(['second'])
    })

    it('takes in a file created under include', () => {
      writeFileSync(added, reporting('added'), 'utf8')
      session.update({ changed: [], created: [added], deleted: [] })
      expect(roots()).toContain(added)
      expect(named(session)).toEqual(['added', 'second'])
    })

    it('drops the names of a file deleted', () => {
      rmSync(added)
      session.update({ changed: [], created: [], deleted: [added] })
      expect(roots()).not.toContain(added)
      expect(named(session)).toEqual(['second'])
    })

    it('resolves an import an unchanged file made to a file created outside include', () => {
      writeFileSync(join(root, 'src', 'via.ts'), "import '../shared/late'\n", 'utf8')
      session.update({ changed: [], created: [join(root, 'src', 'via.ts')], deleted: [] })
      const late = join(root, 'shared', 'late.ts')
      mkdirSync(join(root, 'shared'))
      writeFileSync(late, reporting('late'), 'utf8')
      session.update({ changed: [], created: [late], deleted: [] })
      expect(session.files()).toContain(late)
      expect(named(session)).toContain('late')
    })
  })

  it('survives its tsconfig deleted and restored', () => {
    const root = tempProject()
    const config = join(root, 'tsconfig.json')
    const main = join(root, 'src', 'main.ts')
    const session = open(config)
    const saved = readFileSync(config, 'utf8')
    rmSync(config)
    session.update({ changed: [], created: [], deleted: [config] })
    expect(named(session)).toEqual(['first'])
    writeFileSync(config, saved, 'utf8')
    session.update({ changed: [], created: [config], deleted: [] })
    writeFileSync(main, reporting('restored'), 'utf8')
    session.update({ changed: [main], created: [], deleted: [] })
    expect(named(session)).toEqual(['restored'])
  })

  it('reads a widened include from a saved tsconfig, reported as created the way classify does', () => {
    const root = tempProject()
    const config = join(root, 'tsconfig.json')
    const session = open(config)
    mkdirSync(join(root, 'extra'))
    writeFileSync(join(root, 'extra', 'more.ts'), reporting('extra'), 'utf8')
    const { compilerOptions } = JSON.parse(readFileSync(config, 'utf8'))
    writeFileSync(config, JSON.stringify({ compilerOptions, include: ['src', 'extra'] }), 'utf8')
    session.update({ changed: [], created: [config], deleted: [] })
    expect(named(session)).toEqual(['extra', 'first'])
  })

  it('reads edits in one project while another it references has lost its tsconfig', () => {
    const root = tempProject()
    const config = join(root, 'tsconfig.json')
    const other = join(root, 'b', 'tsconfig.json')
    const main = join(root, 'src', 'main.ts')
    const { compilerOptions } = JSON.parse(readFileSync(config, 'utf8'))
    mkdirSync(join(root, 'b', 'src'), { recursive: true })
    writeFileSync(other, JSON.stringify({ compilerOptions, include: ['src'] }), 'utf8')
    writeFileSync(join(root, 'b', 'src', 'main.ts'), reporting('b-first'), 'utf8')
    writeFileSync(
      config,
      JSON.stringify({ compilerOptions, include: ['src'], references: [{ path: './b' }] }),
      'utf8',
    )
    const session = open(config)
    expect(named(session)).toEqual(['b-first', 'first'])
    rmSync(other)
    session.update({ changed: [], created: [], deleted: [other] })
    writeFileSync(main, reporting('second'), 'utf8')
    session.update({ changed: [main], created: [], deleted: [] })
    expect(named(session)).toEqual(['b-first', 'second'])
  })
})

const written = (file: string, text: string): string => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return file
}

const removed = (target: string): string => {
  rmSync(target, { recursive: true })
  return target
}

describe('a native session fed the way watch feeds it', () => {
  it('gathers what a classic session gathers after every step', () => {
    const root = tempProject()
    const path = (...parts: readonly string[]): string => join(root, ...parts)
    const { compilerOptions } = JSON.parse(readFileSync(path('tsconfig.json'), 'utf8'))
    const base = (include: readonly string[]): string =>
      JSON.stringify({ compilerOptions, include })
    const config = JSON.stringify({
      extends: './tsconfig.base.json',
      references: [{ path: './b' }],
    })
    written(path('tsconfig.base.json'), base(['src']))
    written(path('tsconfig.json'), config)
    written(path('b', 'tsconfig.json'), base(['src']))
    written(path('b', 'src', 'main.ts'), reporting('b-first'))
    const sessions = [classic(ts), native({ sync, is })].map((compiler) =>
      compiler.open(path('tsconfig.json')),
    )
    const steps: readonly (readonly [string, () => readonly string[]])[] = [
      ['edit', () => [written(path('src', 'main.ts'), reporting('second'))]],
      ['new file', () => [written(path('src', 'added.ts'), reporting('added'))]],
      [
        'new folder',
        () => [path('src', 'deep'), written(path('src', 'deep', 'a.ts'), reporting('deep'))],
      ],
      ['file outside include', () => [written(path('extra', 'more.ts'), reporting('extra'))]],
      ['base widened', () => [written(path('tsconfig.base.json'), base(['src', 'extra']))]],
      ['referenced directory removed', () => [removed(path('b'))]],
      ['edit while it is gone', () => [written(path('src', 'main.ts'), reporting('third'))]],
      [
        'referenced directory back',
        () => [
          written(path('b', 'tsconfig.json'), base(['src'])),
          written(path('b', 'src', 'main.ts'), reporting('b-back')),
        ],
      ],
      ['tsconfig deleted', () => [removed(path('tsconfig.json'))]],
      ['tsconfig back', () => [written(path('tsconfig.json'), config)]],
      ['edit after', () => [written(path('src', 'main.ts'), reporting('fourth'))]],
    ]
    try {
      for (const [step, act] of steps) {
        const paths = act()
        for (const session of sessions) {
          for (const changed of paths) {
            session.update(classify(changed, existsSync(changed), new Set(session.files())))
          }
        }
        const [expected, actual] = sessions.map(named)
        expect(actual, step).toEqual(expected)
      }
      expect(sessions.map(named)).toEqual(
        Array.from({ length: 2 }, () => ['added', 'b-back', 'deep', 'extra', 'fourth']),
      )
    } finally {
      for (const session of sessions) session.close()
    }
  })
})
