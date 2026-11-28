import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { packages } from './package.js'

const root = mkdtempSync(join(tmpdir(), 'leko-package-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const write = (path: string, text: string): string => {
  const file = join(root, path)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
  return file
}

write('package.json', JSON.stringify({ name: 'x' }))
write('nameless/package.json', JSON.stringify({ private: true }))
write('broken/package.json', '{ "name": ')

describe('packages', () => {
  it('names the nearest package.json above a file', () => {
    expect(packages()(join(root, 'a/b/file.ts'))).toBe('x')
  })

  it('answers undefined when no package.json is found up to the root', () => {
    const bare = mkdtempSync(join(tmpdir(), 'leko-bare-'))
    try {
      expect(packages()(join(bare, 'src/file.ts'))).toBeUndefined()
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('answers undefined when the nearest package.json has no name', () => {
    expect(packages()(join(root, 'nameless/src/file.ts'))).toBeUndefined()
  })

  it('answers undefined when the nearest package.json does not parse', () => {
    expect(packages()(join(root, 'broken/src/file.ts'))).toBeUndefined()
  })

  it('names the codegen package for a fixture file, which is why its impostor does not count', () => {
    const checkout = fileURLToPath(new URL('../fixtures/app/src/checkout.ts', import.meta.url))
    expect(packages()(checkout)).toBe('@annetaan/leko-codegen')
  })
})
