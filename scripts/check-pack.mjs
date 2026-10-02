/*
 * What a published package's tarball carries has to work once it is
 * installed.
 *
 * This packs each package the way a release does, with `pnpm pack`, into
 * `tarballs/` at the root, emptied first, unpacks it and reads the manifest
 * inside, which is not the one in the workspace. It asks four questions the
 * workspace cannot. Is every bare import declared as a
 * dependency? Node builtins, relative paths and the package's own name are
 * fine; anything else is a package a consumer would be asked to resolve and
 * would not have. Is every path `main`, `types`, `bin` and `exports` name in
 * the tarball? And is the packed `exports` the source's with `development`
 * taken out, so `publishConfig.exports` has not drifted from the tree it
 * copies? Those three are reported per package. And do the public packages
 * carry one version, and name each other by exactly that version? That one is
 * asked across them once every package is packed, and the run fails at the
 * end. The tarballs are left in `tarballs/` for whatever installs or publishes
 * them next.
 *
 * Why each question is asked is CONTRIBUTING.md, **What `@annetaan/leko`
 * ships**. The findings are in `pack.mjs`; this is pnpm, tar and the report.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { DEPENDS, mismatched, unpacked, withoutCondition } from './pack.mjs'

/** `from '…'`, `import '…'`, `import('…')` and `require('…')`, in that order. */
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g

/** Only the files a specifier can hide in. A `.css` or a `LICENSE` cannot. */
const CODE = /\.(m|c)?[jt]s$/

const TARBALLS = fileURLToPath(new URL('../tarballs/', import.meta.url))

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

/**
 * What `pnpm pack` sends: the packed manifest and every path in the tarball.
 * The tarball goes to `TARBALLS` and is unpacked into `into`.
 */
function pack(dir, into) {
  const { filename } = JSON.parse(
    execFileSync('pnpm', ['pack', '--pack-destination', TARBALLS, '--json'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  )
  execFileSync('tar', ['-xzf', resolve(TARBALLS, filename), '-C', into])
  const root = join(into, 'package')
  const files = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
  return { root, files, manifest: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) }
}

/** Every bare import in the packed code that the packed manifest does not depend on. */
function undeclared({ root, files, manifest }) {
  const declared = new Set([
    manifest.name,
    ...DEPENDS.flatMap((field) => Object.keys(manifest[field] ?? {})),
  ])
  const problems = []
  for (const path of files) {
    if (!CODE.test(path)) continue
    const source = readFileSync(join(root, path), 'utf8')
    for (const [, specifier] of source.matchAll(SPECIFIER)) {
      if (specifier.startsWith('.') || specifier.startsWith('#')) continue
      if (builtins.has(specifier)) continue
      if (declared.has(packageOf(specifier))) continue
      problems.push(`${path} imports ${specifier}`)
    }
  }
  return [...new Set(problems)].toSorted()
}

let failures = 0
const manifests = []

rmSync(TARBALLS, { recursive: true, force: true })
mkdirSync(TARBALLS, { recursive: true })

for (const project of projects) {
  const source = JSON.parse(readFileSync(join(project.path, 'package.json'), 'utf8'))
  if (source.private) continue

  const into = mkdtempSync(join(tmpdir(), 'leko-pack-'))
  try {
    const packed = pack(project.path, into)
    manifests.push(packed.manifest)
    const imports = undeclared(packed)
    const missing = unpacked(packed.manifest, new Set(packed.files))
    const drifted = !isDeepStrictEqual(
      packed.manifest.exports,
      withoutCondition(source.exports, 'development'),
    )

    if (imports.length === 0 && missing.length === 0 && !drifted) {
      console.log(
        `ok  ${source.name} — ${packed.files.length} files, nothing undeclared or missing`,
      )
      continue
    }
    failures += 1
    if (imports.length > 0) {
      console.error(`FAIL ${source.name} would ship imports it does not depend on:`)
      for (const problem of imports) console.error(`       ${problem}`)
      console.error('     Declare the package as a dependency, or bundle it in. A workspace')
      console.error('     link is not a dependency: it resolves here and nowhere a consumer is.')
    }
    if (missing.length > 0) {
      console.error(`FAIL ${source.name} names paths its tarball does not carry:`)
      for (const { field, target } of missing) console.error(`       ${field} → ${target}`)
    }
    if (drifted) {
      console.error(
        `FAIL ${source.name}: publishConfig.exports drifted from exports with development taken out`,
      )
    }
  } finally {
    rmSync(into, { recursive: true, force: true })
  }
}

const findings = mismatched(manifests)
for (const finding of findings) {
  if (finding.kind === 'versions') {
    const versions = Object.entries(finding.versions).map(([name, version]) => `${name} ${version}`)
    console.error(`FAIL public packages carry more than one version: ${versions.join(', ')}`)
  } else {
    const { name, field, dependency, range, version } = finding
    console.error(`FAIL ${name} pins ${dependency} to ${range} in ${field}, not ${version}`)
  }
}
if (findings.length > 0) failures += 1

if (failures > 0) process.exit(1)
