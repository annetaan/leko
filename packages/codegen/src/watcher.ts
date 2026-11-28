import {
  type Dirent,
  type FSWatcher,
  readdirSync,
  statSync,
  watch as watchDirectory,
} from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'

export interface Watcher {
  /** Watch these directories and every directory below them, except `node_modules` and names starting with `.`. */
  watch(dirs: readonly string[]): void
  close(): void
}

const skipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.')

const entries = (dir: string): Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

const below = (dir: string): string[] => [
  dir,
  ...entries(dir)
    .filter((entry) => entry.isDirectory() && !skipped(entry.name))
    .flatMap((entry) => below(join(dir, entry.name))),
]

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * `onChange` gets the absolute path of each file created, changed or removed
 * under what it watches.
 *
 * One non-recursive `fs.watch` per directory, because a recursive one on Linux
 * walks `node_modules`.
 */
export function watchTree(onChange: (path: string) => void): Watcher {
  const handles = new Map<string, FSWatcher>()

  const stop = (dir: string): void => {
    handles.get(dir)?.close()
    handles.delete(dir)
  }

  const open = (dir: string): void => {
    if (handles.has(dir)) return
    let handle: FSWatcher
    try {
      handle = watchDirectory(dir, (_, filename) => {
        if (filename === null) return
        const path = join(dir, filename)
        if (isDirectory(path)) {
          if (handles.has(path) || skipped(filename)) return
          const found = below(path)
          for (const each of found) open(each)
          // Whatever landed in it before its own watch began.
          for (const each of found) {
            for (const entry of entries(each)) {
              if (entry.isFile()) onChange(join(each, entry.name))
            }
          }
          return
        }
        stop(path)
        onChange(path)
      })
    } catch {
      return
    }
    handle.on('error', () => stop(dir))
    handles.set(dir, handle)
  }

  return {
    watch(dirs) {
      const wanted = new Set(dirs.flatMap(below))
      for (const dir of handles.keys()) if (!wanted.has(dir)) stop(dir)
      for (const dir of wanted) open(dir)
    },
    close() {
      for (const dir of handles.keys()) stop(dir)
    },
  }
}

/**
 * The directories holding these paths, outside `node_modules`, none inside
 * another unless a dot directory lies between, since `watch` skips those.
 */
export function rootsOf(paths: readonly string[]): readonly string[] {
  const dirs = [
    ...new Set(
      paths
        .filter((path) => isAbsolute(path) && !path.split(/[\\/]/).includes('node_modules'))
        .map((path) => dirname(path)),
    ),
  ]
  return dirs.filter(
    (dir) =>
      !dirs.some((other) => {
        const step = relative(other, dir)
        return (
          step !== '' &&
          !isAbsolute(step) &&
          !step.split(/[\\/]/).some((segment) => segment.startsWith('.'))
        )
      }),
  )
}
