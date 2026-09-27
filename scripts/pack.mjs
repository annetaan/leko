/*
 * What a packed manifest names, and whether the tarball carries it.
 *
 * A manifest and a set of paths in and findings out, so `pack.test.mjs` drives
 * it directly and `check-pack.mjs` is left with pnpm, tar and the report.
 */

/** The exports tree with every `name` key taken out, the other keys left in their order. */
export function withoutCondition(exports, name) {
  if (Array.isArray(exports)) return exports.map((entry) => withoutCondition(entry, name))
  if (exports === null || typeof exports !== 'object') return exports
  return Object.fromEntries(
    Object.entries(exports)
      .filter(([key]) => key !== name)
      .map(([key, value]) => [key, withoutCondition(value, name)]),
  )
}

/** `./dist/index.js` and `dist/index.js` are the same file to a tarball. */
const inPackage = (target) => target.replace(/^\.\//, '')

/** `.development` where a key reads as a name, `["./scroll"]` where it does not. */
const accessor = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`)

/** Every string leaf of an exports tree, with the chain of keys that reaches it. */
function* leaves(value, field) {
  if (typeof value === 'string') {
    yield { field, target: value }
  } else if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) yield* leaves(entry, `${field}[${index}]`)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value))
      yield* leaves(entry, `${field}${accessor(key)}`)
  }
}

/**
 * Every path `main`, `types`, `bin` and `exports` name that `files` lacks, as
 * `{ field, target }`. `files` is the tarball's paths relative to the package
 * root. A null export target says a subpath is withheld and names no file.
 */
export function unpacked(manifest, files) {
  return ['main', 'types', 'bin', 'exports']
    .flatMap((field) => [...leaves(manifest[field], field)])
    .filter(({ target }) => !files.has(inPackage(target)))
}
