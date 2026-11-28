import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { backendFor, classify, reach, referencesIn, SUPPORTED } from './compiler.js'

const solution = fileURLToPath(new URL('../fixtures/solution', import.meta.url))
const dir = '/work/app'
const config = join(dir, 'tsconfig.json')

const project = (json: object): string => {
  const root = mkdtempSync(join(tmpdir(), 'leko-codegen-'))
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify(json), 'utf8')
  return root
}

describe('backendFor', () => {
  it.each([
    ['5.4.5', undefined],
    ['5.5.0', 'classic'],
    ['6.0.3', 'classic'],
    ['7.0.2', undefined],
    ['7.1.0', undefined],
    ['8.0.0', undefined],
    ['6.0.0-beta', undefined],
  ])('reads %s with %s', (version, backend) => {
    expect(backendFor(version)).toBe(backend)
  })
})

describe('SUPPORTED', () => {
  it('is the peer range codegen declares', () => {
    const manifest: { peerDependencies: { typescript: string } } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    )
    expect(SUPPORTED).toBe(manifest.peerDependencies.typescript)
  })
})

describe('referencesIn', () => {
  it('reads past line and block comments', () => {
    const text = `{
      // the app
      "references": [/* first */ { "path": "./app" }]
    }`
    expect(referencesIn(text, config)).toEqual([join(dir, 'app', 'tsconfig.json')])
  })

  it('keeps a // inside a string', () => {
    expect(referencesIn('{ "references": [{ "path": "./a//b" }] }', config)).toEqual([
      join(dir, 'a', 'b', 'tsconfig.json'),
    ])
  })

  it('reads past trailing commas', () => {
    const text = '{ "references": [{ "path": "./a", }, { "path": "./b" },], }'
    expect(referencesIn(text, config)).toEqual([
      join(dir, 'a', 'tsconfig.json'),
      join(dir, 'b', 'tsconfig.json'),
    ])
  })

  it('takes a path ending in .json as the file', () => {
    expect(referencesIn('{ "references": [{ "path": "./tsconfig.app.json" }] }', config)).toEqual([
      join(dir, 'tsconfig.app.json'),
    ])
  })

  it('takes any other path as a directory holding tsconfig.json', () => {
    expect(referencesIn('{ "references": [{ "path": "../tools" }] }', config)).toEqual([
      join('/work', 'tools', 'tsconfig.json'),
    ])
  })

  it('reads past a byte order mark, as TypeScript does', () => {
    expect(referencesIn('\uFEFF{ "references": [{ "path": "./app" }] }', config)).toEqual([
      join(dir, 'app', 'tsconfig.json'),
    ])
  })

  it('gives nothing for a tsconfig with no references', () => {
    expect(referencesIn('{ "include": ["src"] }', config)).toEqual([])
  })

  it('throws naming the tsconfig it cannot parse', () => {
    expect(() => referencesIn('{ "references": ', config)).toThrow(/^\/work\/app\/tsconfig\.json/)
  })
})

describe('reach', () => {
  it('walks a solution depth-first, the tsconfig first', () => {
    expect(reach(join(solution, 'tsconfig.json'))).toEqual([
      join(solution, 'tsconfig.json'),
      join(solution, 'tsconfig.app.json'),
      join(solution, 'tools', 'tsconfig.json'),
    ])
  })

  it('reads a project reached twice only once, so references that loop end', () => {
    const root = project({ files: ['a.ts'], references: [{ path: './b' }] })
    mkdirSync(join(root, 'b'))
    writeFileSync(
      join(root, 'b', 'tsconfig.json'),
      JSON.stringify({ files: ['b.ts'], references: [{ path: '..' }] }),
      'utf8',
    )
    expect(reach(join(root, 'tsconfig.json'))).toEqual([
      join(root, 'tsconfig.json'),
      join(root, 'b', 'tsconfig.json'),
    ])
  })

  it('throws naming a referenced tsconfig that does not exist', () => {
    const root = project({ files: [], references: [{ path: './tsconfig.gone.json' }] })
    expect(() => reach(join(root, 'tsconfig.json'))).toThrow(/tsconfig\.gone\.json/)
  })
})

describe('classify', () => {
  const known = new Set(['/work/app/src/a.ts'])

  it('calls a path that is gone deleted', () => {
    expect(classify('/work/app/src/a.ts', false, known)).toEqual({
      changed: [],
      created: [],
      deleted: ['/work/app/src/a.ts'],
    })
  })

  it('calls a file the session holds changed', () => {
    expect(classify('/work/app/src/a.ts', true, known)).toEqual({
      changed: ['/work/app/src/a.ts'],
      created: [],
      deleted: [],
    })
  })

  it('calls a file the session does not hold created', () => {
    expect(classify('/work/app/src/b.ts', true, known)).toEqual({
      changed: [],
      created: ['/work/app/src/b.ts'],
      deleted: [],
    })
  })
})
