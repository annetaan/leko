import { describe, expect, it } from 'vitest'

import { cite } from './cite.mjs'
import { dangling, droppable, mismatched, unpacked, withoutCondition } from './pack.mjs'

describe('unpacked', () => {
  it('names an export target the tarball does not carry', () => {
    // The bug in CONTRIBUTING.md, **What `@annetaan/leko` ships**.
    const manifest = {
      exports: {
        '.': {
          development: './src/index.ts',
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
      },
    }
    expect(unpacked(manifest, new Set(['dist/index.d.ts', 'dist/index.js']))).toEqual([
      { field: 'exports["."].development', target: './src/index.ts' },
    ])
  })

  it('passes a manifest whose every target is packed', () => {
    const manifest = {
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
    }
    expect(unpacked(manifest, new Set(['dist/index.d.ts', 'dist/index.js']))).toEqual([])
  })

  it('reads nested conditions and a string shorthand export', () => {
    const manifest = {
      exports: {
        '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } },
        './leko.css': './dist/leko.css',
      },
    }
    expect(unpacked(manifest, new Set(['dist/index.js']))).toEqual([
      { field: 'exports["."].import.types', target: './dist/index.d.ts' },
      { field: 'exports["./leko.css"]', target: './dist/leko.css' },
    ])
  })

  it('checks main, types and bin, as a string and as a map', () => {
    const files = new Set()
    expect(
      unpacked({ main: 'dist/a.js', types: './dist/a.d.ts', bin: './dist/cli.js' }, files),
    ).toEqual([
      { field: 'main', target: 'dist/a.js' },
      { field: 'types', target: './dist/a.d.ts' },
      { field: 'bin', target: './dist/cli.js' },
    ])
    expect(unpacked({ bin: { 'leko-signals': './dist/cli.js' } }, files)).toEqual([
      { field: 'bin["leko-signals"]', target: './dist/cli.js' },
    ])
  })

  it('ignores a null target', () => {
    expect(
      unpacked(
        { exports: { '.': './dist/index.js', './internal': null } },
        new Set(['dist/index.js']),
      ),
    ).toEqual([])
  })
})

describe('droppable', () => {
  const exports = {
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
    './leko.css': './dist/leko.css',
  }

  it('finds a stylesheet export a false sideEffects lets a bundler drop', () => {
    expect(droppable({ sideEffects: false, exports })).toEqual([
      { field: 'exports["./leko.css"]', target: './dist/leko.css' },
    ])
  })

  it('finds a stylesheet export missing from a sideEffects list', () => {
    expect(droppable({ sideEffects: ['./dist/other.css'], exports })).toEqual([
      { field: 'exports["./leko.css"]', target: './dist/leko.css' },
    ])
  })

  it('passes a stylesheet export the sideEffects list names, written with or without ./', () => {
    expect(droppable({ sideEffects: ['./dist/leko.css'], exports })).toEqual([])
    expect(droppable({ sideEffects: ['dist/leko.css'], exports })).toEqual([])
  })

  it('passes when sideEffects is absent or true', () => {
    expect(droppable({ exports })).toEqual([])
    expect(droppable({ sideEffects: true, exports })).toEqual([])
  })
})

describe('withoutCondition', () => {
  it('removes the condition at every level and leaves the others in order', () => {
    const exports = {
      '.': {
        development: './src/index.ts',
        import: {
          development: './src/index.ts',
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
        default: './dist/index.cjs',
      },
      './leko.css': './dist/leko.css',
      './internal': null,
    }
    const stripped = withoutCondition(exports, 'development')
    expect(stripped).toEqual({
      '.': {
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        default: './dist/index.cjs',
      },
      './leko.css': './dist/leko.css',
      './internal': null,
    })
    expect(Object.keys(stripped['.'])).toEqual(['import', 'default'])
    expect(Object.keys(stripped['.'].import)).toEqual(['types', 'default'])
  })
})

const leko = { name: '@annetaan/leko', version: '0.1.0' }
const codegen = (peer, extra = {}) => ({
  name: '@annetaan/leko-codegen',
  version: '0.1.0',
  peerDependencies: { typescript: '>=5.5.0', vite: '>=5.0.0', '@annetaan/leko': peer },
  ...extra,
})

const peerFinding = (range) => ({
  kind: 'range',
  name: '@annetaan/leko-codegen',
  field: 'peerDependencies',
  dependency: '@annetaan/leko',
  range,
  version: '0.1.0',
})

describe('mismatched', () => {
  it('passes packages that share a version and pin each other to it', () => {
    expect(mismatched([leko, codegen('0.1.0')])).toEqual([])
  })

  it('names packages that carry different versions', () => {
    const behind = { ...codegen('0.1.0'), version: '0.0.0' }
    expect(mismatched([leko, behind])).toEqual([
      {
        kind: 'versions',
        versions: { '@annetaan/leko': '0.1.0', '@annetaan/leko-codegen': '0.0.0' },
      },
    ])
  })

  it('names a peer on a public package that is not its exact version', () => {
    expect(mismatched([leko, codegen('^0.1.0')])).toEqual([peerFinding('^0.1.0')])
    expect(mismatched([leko, codegen('workspace:*')])).toEqual([peerFinding('workspace:*')])
  })

  it('ignores a dependency on a package that is not public here', () => {
    const manifest = { ...leko, dependencies: { '@annetaan/leko-machine': 'workspace:*' } }
    expect(mismatched([manifest, codegen('0.1.0')])).toEqual([])
  })

  it('does not read devDependencies', () => {
    const manifest = codegen('0.1.0', { devDependencies: { '@annetaan/leko': '0.0.0' } })
    expect(mismatched([leko, manifest])).toEqual([])
  })
})

describe('dangling', () => {
  it('finds a sourceMappingURL naming a file the tarball lacks', () => {
    const text = 'export {}\n//# sourceMappingURL=index.js.map\n'
    expect(dangling('dist/index.js', text, new Set(['dist/index.js']))).toEqual([
      { kind: 'map', path: 'dist/index.js', target: 'index.js.map' },
    ])
    const css = '.a{}\n/*# sourceMappingURL=leko.css.map */\n'
    expect(dangling('dist/leko.css', css, new Set(['dist/leko.css']))).toEqual([
      { kind: 'map', path: 'dist/leko.css', target: 'leko.css.map' },
    ])
  })

  it('resolves the map beside the file that names it', () => {
    const text = 'export {}\n//# sourceMappingURL=a.js.map\n'
    expect(dangling('dist/a.js', text, new Set(['dist/a.js', 'dist/a.js.map']))).toEqual([])
    expect(dangling('dist/a.js', text, new Set(['dist/a.js', 'a.js.map']))).toEqual([
      { kind: 'map', path: 'dist/a.js', target: 'a.js.map' },
    ])
  })

  it('passes an inline data: source map', () => {
    const text = 'export {}\n//# sourceMappingURL=data:application/json;base64,e30=\n'
    expect(dangling('dist/a.js', text, new Set(['dist/a.js']))).toEqual([])
  })

  it('finds a bare DESIGN.md in a comment of a packed file', () => {
    const text = '/** DESIGN.md argues it under **The halo**. */\nexport {}\n'
    expect(dangling('dist/index.d.ts', text, new Set(['dist/index.d.ts']))).toEqual([
      { kind: 'name', path: 'dist/index.d.ts', target: 'DESIGN.md' },
    ])
  })

  it('finds a relative link into the repository, with or without a fragment', () => {
    const text = '// [The halo](../DESIGN.md#the-halo) and [a spike](../../../spike/a/).\n'
    expect(dangling('dist/types.d.ts', text, new Set(['dist/types.d.ts']))).toEqual([
      { kind: 'link', path: 'dist/types.d.ts', target: '../DESIGN.md' },
      { kind: 'link', path: 'dist/types.d.ts', target: '../../../spike/a/' },
    ])
  })

  it('passes a link to a packed file, an absolute URL and a fragment-only link', () => {
    const text = '// [readme](../README.md), [w3](https://www.w3.org/) and [below](#below).\n'
    expect(dangling('dist/a.js', text, new Set(['dist/a.js', 'README.md']))).toEqual([])
  })

  it('reads only comments, so a name in a string is not flagged', () => {
    const text = "export const a = 'DESIGN.md and [x](../DESIGN.md)'\n"
    expect(dangling('dist/a.js', text, new Set(['dist/a.js']))).toEqual([])
  })

  it('passes what cite wrote', () => {
    const input = [
      '/**',
      " * DESIGN.md's **The halo**, CLAUDE.md, and [the message](../DESIGN.md#the-message)",
      ' * beside [a spike](../../../spike/a/).',
      ' */',
      'export {}',
      '',
    ].join('\n')
    const root = '/repo/'
    const output = cite(input, {
      file: `${root}packages/scroll/dist/types.d.ts`,
      root,
      base: 'https://github.com/annetaan/leko/blob/v0.1.0/',
      anchors: new Map([['packages/scroll/DESIGN.md', new Set(['the-message'])]]),
    })
    expect(output).not.toBe(input)
    expect(dangling('dist/types.d.ts', output, new Set(['dist/types.d.ts']))).toEqual([])
  })
})
