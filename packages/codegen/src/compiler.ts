import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

import { classic } from './classic.js'
import type { ScanResult } from './scan.js'

export interface Changes {
  readonly changed: readonly string[]
  readonly created: readonly string[]
  readonly deleted: readonly string[]
}

export interface Project {
  /** The tsconfig, absolute. */
  readonly config: string
  /** The files it names now, as the compiler holds them. */
  readonly roots: readonly string[]
}

export interface Session {
  /** The tsconfig and every project it references, depth-first, each once, in `reach` order. */
  projects(): readonly Project[]
  /** Every file any program holds, declaration files and libraries included. */
  files(): readonly string[]
  scan(): ScanResult
  /** Brings every program up to date with the disk for these paths. */
  update(changes: Changes): void
  /** Ends the session. A session that started a process stops it. */
  close(): void
}

export interface Compiler {
  /** Throws naming the tsconfig it cannot read. */
  open(config: string): Session
}

/** The peer range in packages/codegen/package.json, word for word. */
export const SUPPORTED = '>=5.5.0 <7.0.0'

/** Which backend reads this TypeScript version, or `undefined` outside SUPPORTED. */
export function backendFor(version: string): 'classic' | 'native' | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) return undefined
  const major = Number(match[1])
  const minor = Number(match[2])
  return (major === 5 && minor >= 5) || major === 6 ? 'classic' : undefined
}

/** The backend for the `typescript` this package resolves. Throws, naming SUPPORTED and the version found, outside it. */
export function load(): Compiler {
  if (backendFor(ts.version) === 'classic') return classic(ts)
  throw new Error(`leko-signals reads TypeScript ${SUPPORTED}, and this project has ${ts.version}.`)
}

/** The tsconfig and every project it references, transitively, depth-first, each once. */
export function reach(config: string): readonly string[] {
  const seen = new Set<string>()
  const walk = (path: string): void => {
    if (seen.has(path)) return
    seen.add(path)
    for (const next of referencesIn(readFileSync(path, 'utf8'), path)) walk(next)
  }
  walk(resolve(config))
  return [...seen]
}

const STRING = String.raw`"(?:[^"\\]|\\.)*"`
const COMMENTS = new RegExp(`(${STRING})|//[^\\n]*|/\\*[\\s\\S]*?\\*/`, 'g')
const TRAILING_COMMAS = new RegExp(`(${STRING})|,(?=\\s*[}\\]])`, 'g')

/**
 * The tsconfigs a tsconfig's own `references` name, resolved against its
 * directory: a path ending in `.json` is the file, anything else a directory
 * holding `tsconfig.json`. JSON with comments and trailing commas.
 */
export function referencesIn(text: string, config: string): readonly string[] {
  const json = text
    .replace(/^\uFEFF/, '')
    .replace(COMMENTS, (_, string?: string) => string ?? '')
    .replace(TRAILING_COMMAS, (_, string?: string) => string ?? '')
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    throw new Error(`${config}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
  const references =
    typeof parsed === 'object' && parsed !== null && 'references' in parsed
      ? parsed.references
      : undefined
  if (!Array.isArray(references)) return []
  return references.flatMap((reference: unknown) => {
    const path =
      typeof reference === 'object' && reference !== null && 'path' in reference
        ? reference.path
        : undefined
    if (typeof path !== 'string') return []
    const target = resolve(dirname(config), path)
    return [target.endsWith('.json') ? target : join(target, 'tsconfig.json')]
  })
}

/** What a watcher event on `path` is to a session that holds `known`. */
export function classify(path: string, exists: boolean, known: ReadonlySet<string>): Changes {
  if (!exists) return { changed: [], created: [], deleted: [path] }
  return known.has(path)
    ? { changed: [path], created: [], deleted: [] }
    : { changed: [], created: [path], deleted: [] }
}
