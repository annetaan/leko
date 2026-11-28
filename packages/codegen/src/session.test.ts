import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'

import { classic } from './classic.js'
import type { Compiler, Session } from './compiler.js'

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

describe.each<[string, Compiler]>([['classic', classic(ts)]])('a %s session', (_, compiler) => {
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
})
