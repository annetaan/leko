import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { rootsOf, watchTree } from './watcher.js'

const watched = (): { root: string; seen: string[]; stop: () => void } => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'leko-codegen-')))
  mkdirSync(join(root, 'node_modules'))
  const seen: string[] = []
  const watcher = watchTree((path) => seen.push(path))
  watcher.watch([root])
  return { root, seen, stop: () => watcher.close() }
}

// Each poll writes again: on macOS a write made before the first watch of a
// busy process has started is lost for good, and the poll is what outlasts it.
const written = async (seen: readonly string[], path: string): Promise<void> => {
  await vi.waitFor(() => {
    writeFileSync(path, '', 'utf8')
    expect(seen).toContain(path)
  })
}

describe('watchTree', () => {
  it('reports a file written in a watched directory', async () => {
    const { root, seen, stop } = watched()
    try {
      await written(seen, join(root, 'a.ts'))
    } finally {
      stop()
    }
  })

  it('reports a file written in a directory created after it started', async () => {
    const { root, seen, stop } = watched()
    try {
      await written(seen, join(root, 'control.ts'))
      mkdirSync(join(root, 'later'))
      writeFileSync(join(root, 'later', 'b.ts'), '', 'utf8')
      await vi.waitFor(() => expect(seen).toContain(join(root, 'later', 'b.ts')))
    } finally {
      stop()
    }
  })

  it('reports a file removed', async () => {
    const { root, seen, stop } = watched()
    try {
      await written(seen, join(root, 'gone.ts'))
      seen.length = 0
      rmSync(join(root, 'gone.ts'))
      await vi.waitFor(() => expect(seen).toContain(join(root, 'gone.ts')))
    } finally {
      stop()
    }
  })

  it('reports nothing written under node_modules', async () => {
    const { root, seen, stop } = watched()
    try {
      await written(seen, join(root, 'control.ts'))
      writeFileSync(join(root, 'node_modules', 'lib.d.ts'), '', 'utf8')
      await written(seen, join(root, 'later.ts'))
      expect(seen).not.toContain(join(root, 'node_modules', 'lib.d.ts'))
    } finally {
      stop()
    }
  })
})

describe('rootsOf', () => {
  it('keeps the outermost directory of nested ones', () => {
    expect(rootsOf(['/app/tsconfig.json', '/app/src/a.ts', '/app/src/deep/b.ts'])).toEqual(['/app'])
  })

  it('keeps directories that sit side by side', () => {
    expect(rootsOf(['/app/src/a.ts', '/tools/b.ts'])).toEqual(['/app/src', '/tools'])
  })

  it('keeps a dot directory inside another, since watch walks past it', () => {
    expect(rootsOf(['/app/tsconfig.json', '/app/.storybook/preview.ts'])).toEqual([
      '/app',
      '/app/.storybook',
    ])
  })

  it('leaves out anything under node_modules', () => {
    expect(rootsOf(['/app/src/a.ts', '/app/node_modules/typescript/lib/lib.d.ts'])).toEqual([
      '/app/src',
    ])
  })
})
