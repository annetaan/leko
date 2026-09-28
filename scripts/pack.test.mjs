import { describe, expect, it } from 'vitest'

import { unpacked, withoutCondition } from './pack.mjs'

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
