import type ts from 'typescript'

import { type Compiler, reach } from './compiler.js'
import { packages } from './package.js'
import { type Program, scan } from './scan.js'

export function classicProgram(tsm: typeof ts, program: ts.Program): Program<ts.Node> {
  const checker = program.getTypeChecker()
  return {
    files: program.getSourceFiles().filter((file) => !file.isDeclarationFile),
    syntax: {
      isPropertyAccess: tsm.isPropertyAccessExpression,
      isElementAccess: tsm.isElementAccessExpression,
      isCall: tsm.isCallExpression,
      isBindingElement: tsm.isBindingElement,
      isObjectBindingPattern: tsm.isObjectBindingPattern,
      isNamed: (node): node is ts.Identifier | ts.StringLiteral =>
        tsm.isIdentifier(node) || tsm.isStringLiteral(node),
      isMethod: (node) => tsm.isMethodDeclaration(node) || tsm.isMethodSignature(node),
      isClassOrInterface: (node) =>
        tsm.isClassDeclaration(node) || tsm.isInterfaceDeclaration(node),
    },
    checker: {
      declarationOf: (node) => checker.getSymbolAtLocation(node)?.declarations?.[0],
      propertyOf: (node, name) =>
        checker.getNonNullableType(checker.getTypeAtLocation(node)).getProperty(name)
          ?.declarations?.[0],
      literalsOf: (node) => {
        const type = checker.getTypeAtLocation(node)
        return (type.isUnion() ? type.types : [type]).map((part) =>
          part.isStringLiteral() ? part.value : undefined,
        )
      },
    },
  }
}

interface Built {
  readonly config: string
  readonly parsed: ts.ParsedCommandLine
  readonly cache: Map<string, ts.SourceFile>
  readonly host: ts.CompilerHost
  readonly program: ts.Program
}

const same = (a: ts.ParsedCommandLine, b: ts.ParsedCommandLine): boolean =>
  a.fileNames.join('\n') === b.fileNames.join('\n') &&
  JSON.stringify(a.options) === JSON.stringify(b.options)

export function classic(tsm: typeof ts): Compiler {
  const parse = (config: string): ts.ParsedCommandLine => {
    const parsed = tsm.getParsedCommandLineOfConfigFile(
      config,
      {},
      {
        ...tsm.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          throw new Error(tsm.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
        },
      },
    )
    if (!parsed) throw new Error(`Could not read ${config}`)
    return parsed
  }

  // Diagnostics belong to whatever is already compiling this project, and a
  // tsconfig TypeScript cannot read mid-save must not take the dev server down.
  const reparse = (built: Built): ts.ParsedCommandLine => {
    try {
      return parse(built.config)
    } catch {
      return built.parsed
    }
  }

  const build = (
    config: string,
    parsed: ts.ParsedCommandLine,
    previous?: Built,
    oldProgram?: ts.Program,
  ): Built => {
    const cache = previous?.cache ?? new Map<string, ts.SourceFile>()
    const host = previous?.host ?? cached(tsm.createCompilerHost(parsed.options), cache)
    const program = tsm.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      host,
      oldProgram,
    })
    return { config, parsed, cache, host, program }
  }

  return {
    open(config) {
      const configs = reach(config)
      const packageOf = packages()
      let built = configs.map((path) => build(path, parse(path)))
      return {
        projects: () => built.map((p) => ({ config: p.config, roots: p.parsed.fileNames })),
        files: () => [
          ...new Set(built.flatMap((p) => p.program.getSourceFiles().map((file) => file.fileName))),
        ],
        scan: () =>
          scan(
            built.map((p) => classicProgram(tsm, p.program)),
            packageOf,
          ),
        update: ({ changed, created, deleted }) => {
          const paths = [...changed, ...created, ...deleted].map((path) =>
            path.replaceAll('\\', '/'),
          )
          let dropped = false
          for (const p of built) {
            for (const path of paths) dropped = p.cache.delete(path) || dropped
          }
          const moved = created.length > 0 || deleted.length > 0
          const again = moved || changed.some((path) => configs.includes(path))
          const next = built.map((p) => ({ previous: p, parsed: again ? reparse(p) : p.parsed }))
          if (
            !moved &&
            !dropped &&
            next.every(({ previous, parsed }) => same(previous.parsed, parsed))
          ) {
            return
          }
          // An old program hands an unchanged file's module resolutions on, so a
          // file created where an import already pointed would stay unresolved.
          built = next.map(({ previous, parsed }) =>
            build(previous.config, parsed, previous, moved ? undefined : previous.program),
          )
        },
        close: () => {},
      }
    },
  }
}

const cached = (host: ts.CompilerHost, cache: Map<string, ts.SourceFile>): ts.CompilerHost => {
  const read = host.getSourceFile.bind(host)
  return {
    ...host,
    getSourceFile: (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      const hit = shouldCreateNewSourceFile ? undefined : cache.get(fileName)
      if (hit) return hit
      const file = read(fileName, languageVersion, onError, shouldCreateNewSourceFile)
      if (file) cache.set(fileName, file)
      return file
    },
  }
}
