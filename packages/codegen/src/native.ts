import { existsSync } from 'node:fs'

import { type Compiler, reach } from './compiler.js'
import { packages } from './package.js'
import { type Node, type Program, scan, type SourceFile, type Syntax } from './scan.js'

// The part of `typescript/unstable/*` this backend uses, declared here rather
// than imported, so no published declaration names a module TypeScript 6 lacks.

export interface NativeNode extends Node<NativeNode> {}

type NativeFile = SourceFile<NativeNode> & { readonly isDeclarationFile: boolean }

type Named = NativeNode & { readonly text: string }

interface NativeSymbol {
  readonly declarations?: readonly { resolve(): NativeNode | undefined }[] | undefined
}

interface NativeType {
  isUnionType(): this is NativeType & { getTypes(): readonly NativeType[] }
  isStringLiteralType(): this is NativeType & { readonly value: string }
}

interface NativeProject {
  readonly rootFiles: readonly string[]
  readonly program: {
    getSourceFileNames(): readonly string[]
    getSourceFile(file: string): NativeFile | undefined
  }
  readonly checker: {
    getSymbolAtLocation(node: NativeNode): NativeSymbol | undefined
    getTypeAtLocation(node: NativeNode): NativeType | undefined
    getNonNullableType(type: NativeType): NativeType | undefined
    getPropertyOfType(type: NativeType, name: string): NativeSymbol | undefined
  }
}

interface NativeSnapshot {
  getProject(config: string): NativeProject | undefined
  dispose(): void
}

export interface Native {
  readonly sync: {
    API: new (options: { cwd?: string }) => {
      updateSnapshot(params: {
        openProjects?: string[]
        closeProjects?: string[]
        fileChanges?: { changed?: string[]; created?: string[]; deleted?: string[] }
      }): NativeSnapshot
      close(): void
    }
  }
  readonly is: {
    isPropertyAccessExpression: Syntax<NativeNode>['isPropertyAccess']
    isElementAccessExpression: Syntax<NativeNode>['isElementAccess']
    isCallExpression: Syntax<NativeNode>['isCall']
    isBindingElement: Syntax<NativeNode>['isBindingElement']
    isObjectBindingPattern(node: NativeNode): boolean
    isIdentifier(node: NativeNode): node is Named
    isStringLiteral(node: NativeNode): node is Named
    isMethodDeclaration(node: NativeNode): boolean
    isMethodSignatureDeclaration(node: NativeNode): boolean
    isClassDeclaration(node: NativeNode): node is NativeNode & { readonly name?: Named | undefined }
    isInterfaceDeclaration(node: NativeNode): node is NativeNode & { readonly name: Named }
  }
}

export function native(modules: Native): Compiler {
  const { is } = modules
  const nativeProgram = (project: NativeProject): Program<NativeNode> => {
    const { program, checker } = project
    return {
      files: program
        .getSourceFileNames()
        .flatMap((name) => program.getSourceFile(name) ?? [])
        .filter((file) => !file.isDeclarationFile),
      syntax: {
        isPropertyAccess: is.isPropertyAccessExpression,
        isElementAccess: is.isElementAccessExpression,
        isCall: is.isCallExpression,
        isBindingElement: is.isBindingElement,
        isObjectBindingPattern: is.isObjectBindingPattern,
        isNamed: (node): node is Named => is.isIdentifier(node) || is.isStringLiteral(node),
        isMethod: (node) => is.isMethodDeclaration(node) || is.isMethodSignatureDeclaration(node),
        isClassOrInterface: (node) =>
          is.isClassDeclaration(node) || is.isInterfaceDeclaration(node),
      },
      checker: {
        declarationOf: (node) => checker.getSymbolAtLocation(node)?.declarations?.[0]?.resolve(),
        propertyOf: (node, name) => {
          const type = checker.getTypeAtLocation(node)
          const present = type && checker.getNonNullableType(type)
          return present && checker.getPropertyOfType(present, name)?.declarations?.[0]?.resolve()
        },
        literalsOf: (node) => {
          const type = checker.getTypeAtLocation(node)
          if (!type) return []
          return (type.isUnionType() ? type.getTypes() : [type]).map((part) =>
            part.isStringLiteralType() ? part.value : undefined,
          )
        },
      },
    }
  }

  return {
    open(config) {
      const configs = reach(config)
      const packageOf = packages()
      const api = new modules.sync.API({})
      // TypeScript 7 does not open a project's references, so every one is named.
      const first = api.updateSnapshot({ openProjects: [...configs] })
      let closed: ReadonlySet<string> = new Set()
      let held: ReadonlyMap<string, NativeSnapshot> = new Map(configs.map((path) => [path, first]))
      const project = (path: string): NativeProject | undefined => held.get(path)?.getProject(path)
      return {
        projects: () =>
          configs.map((path) => ({ config: path, roots: project(path)?.rootFiles ?? [] })),
        files: () => [
          ...new Set(configs.flatMap((path) => project(path)?.program.getSourceFileNames() ?? [])),
        ],
        scan: () =>
          scan(configs.flatMap((path) => project(path) ?? []).map(nativeProgram), packageOf),
        update: ({ changed, created, deleted }) => {
          // A project whose tsconfig is gone while open makes every later
          // update throw `project not found for update`, even once the file is
          // back, so it is closed, and its last snapshot read, until it returns.
          // The disk decides, since a tsconfig can go with its directory.
          const gone = configs.filter((path) => !closed.has(path) && !existsSync(path))
          const back = configs.filter((path) => closed.has(path) && existsSync(path))
          // TypeScript 7 takes a file it holds reported as created, a tsconfig
          // or the base one extends, for no change, and a returning project's
          // tsconfig named only through its directory for still gone.
          const arrived = [...created, ...back]
          const next = api.updateSnapshot({
            openProjects: back,
            closeProjects: gone,
            fileChanges: {
              changed: [...changed, ...arrived],
              created: arrived,
              deleted: [...deleted],
            },
          })
          closed = new Set([...closed, ...gone].filter((path) => !back.includes(path)))
          const previous = new Set([...held.values(), next])
          held = new Map(
            configs.map((path) => [path, closed.has(path) ? (held.get(path) ?? next) : next]),
          )
          const kept = new Set(held.values())
          // A snapshot left undisposed keeps every file it read alive.
          for (const snapshot of previous) if (!kept.has(snapshot)) snapshot.dispose()
        },
        close: () => api.close(),
      }
    },
  }
}
