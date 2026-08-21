/*
 * Every bare import in a published package has to be something npm will
 * install.
 *
 * This exists because splitting the core broke publishing and nothing noticed.
 * `packages/leko` imported `@annetaan/leko-machine` and
 * `@annetaan/leko-spotlight`, both `private: true` and neither on the registry.
 * Inside the workspace they resolve through pnpm's links and every check
 * passed: the build, the typecheck, 265 tests, three browsers. The failure was
 * only ever visible to somebody who had installed the tarball, and nobody had.
 *
 * So this reads what `npm pack` would actually send, and asks the one question
 * the workspace cannot: is each of these specifiers declared as a dependency?
 * Node builtins are fine, relative paths are fine, and self-references to the
 * package's own name are fine. Anything else is a package a consumer would be
 * asked to resolve and would not have.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join } from 'node:path'

/** `from '…'`, `import '…'`, `import('…')` and `require('…')`, in that order. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g

/** Only the files a specifier can hide in. A `.css` or a `LICENSE` cannot. */
const CODE = /\.(m|c)?[jt]s$/

const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

/**
 * `@scope/name/deep/path` is a request for `@scope/name`, and `name/sub` for
 * `name`. Everything after that is a subpath the dependency itself resolves.
 */
function packageOf(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

const projects = JSON.parse(
  execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], { encoding: 'utf8' }),
)

let failures = 0

for (const project of projects) {
  const manifest = JSON.parse(readFileSync(join(project.path, 'package.json'), 'utf8'))
  if (manifest.private) continue

  // `--dry-run` still reports exactly what would go in, and writes nothing.
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: project.path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  )

  const declared = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ])

  const problems = []
  for (const entry of packed.files) {
    if (!CODE.test(entry.path)) continue
    const file = join(project.path, entry.path)
    if (!existsSync(file)) continue
    const source = readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      if (specifier.startsWith('.') || specifier.startsWith('#')) continue
      if (builtins.has(specifier)) continue
      const name = packageOf(specifier)
      if (declared.has(name)) continue
      problems.push(`${entry.path} imports ${specifier}`)
    }
  }

  if (problems.length === 0) {
    console.log(`ok  ${manifest.name} — ${packed.files.length} files, nothing undeclared`)
    continue
  }
  failures += 1
  console.error(`FAIL ${manifest.name} would ship imports it does not depend on:`)
  for (const problem of [...new Set(problems)].toSorted()) console.error(`       ${problem}`)
}

if (failures > 0) {
  console.error(
    '\nEither declare the package as a dependency, or bundle it in. A workspace' +
      '\nlink is not a dependency: it resolves here and nowhere a consumer is.',
  )
  process.exit(1)
}
