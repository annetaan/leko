/** Where a name was reported from. Paths are whatever the program held. */
export interface Site {
  file: string
  /** 1-based, so it matches what an editor shows. */
  line: number
}

export interface Signal {
  name: string
  /** Every call that reports this name, in the order they were walked. */
  sites: Site[]
}

export interface ScanResult {
  /** Sorted by name, so the same project always emits the same file. */
  signals: Signal[]
  /**
   * Calls whose argument is not a string the compiler could pin down:
   * `reached(`step-${i}`)`, or a name arriving from outside the project. And
   * every reference to Leko's `reached` that is not a call written
   * `leko.reached(…)`: `leko['reached']`, `.call`, `.bind`, a destructured
   * `reached`, each of which hides its argument from this scan.
   *
   * These are the reason `--loose` exists. A vocabulary gathered from a project
   * that builds names at runtime is incomplete by construction, and a strict
   * `awaits` on top of an incomplete vocabulary rejects steps that are right.
   */
  unread: Site[]
}

export interface Node<N> {
  readonly parent: N
  forEachChild<T>(visit: (node: N) => T): T | undefined
  getStart(): number
  getSourceFile(): SourceFile<N>
}

export interface SourceFile<N> extends Node<N> {
  readonly fileName: string
  getLineAndCharacterOfPosition(position: number): { readonly line: number }
}

type Named<N> = N & { readonly text: string }

export interface Syntax<N> {
  isPropertyAccess(node: N): node is N & { readonly expression: N; readonly name: Named<N> }
  isElementAccess(node: N): node is N & { readonly expression: N; readonly argumentExpression: N }
  isCall(node: N): node is N & { readonly expression: N; readonly arguments: readonly N[] }
  isBindingElement(
    node: N,
  ): node is N & { readonly propertyName?: N | undefined; readonly name?: N | undefined }
  isObjectBindingPattern(node: N): boolean
  /** An identifier or a string literal. */
  isNamed(node: N): node is Named<N>
  /** A method declaration or a method signature. */
  isMethod(node: N): boolean
  isClassOrInterface(node: N): node is N & { readonly name?: Named<N> | undefined }
}

export interface Checker<N> {
  /** The first declaration of the symbol `node` names. */
  declarationOf(node: N): N | undefined
  /** The first declaration of property `name` on the non-nullable type of `node`. */
  propertyOf(node: N, name: string): N | undefined
  /** Each arm of the type of `node` (the type itself when it is no union): its string literal value, or `undefined`. */
  literalsOf(node: N): readonly (string | undefined)[]
}

export interface Program<N> {
  /** The files that are not declaration files. */
  readonly files: readonly SourceFile<N>[]
  readonly syntax: Syntax<N>
  readonly checker: Checker<N>
}

/** The package whose `Leko` counts. Everybody else's is somebody else's. */
const PACKAGE = '@annetaan/leko'

/**
 * Whether `declaration` is the `reached` method of a Leko instance.
 *
 * Asking the checker where the method was declared is what a regular expression
 * cannot do. `queue.reached('x')` in the same file resolves to a different
 * declaration and is left alone.
 *
 * The class counts by the package that declares it, not by its name. A name
 * alone counts a stranger's class, which puts a stranger's string into the
 * vocabulary. The package that declares the class is a question both compilers
 * can answer, and it does not care how `@annetaan/leko` is split into files.
 */
const isLekoReached = <N extends Node<N>>(
  declaration: N | undefined,
  syntax: Syntax<N>,
  packageOf: (file: string) => string | undefined,
): boolean => {
  if (declaration === undefined || !syntax.isMethod(declaration)) return false
  const parent = declaration.parent
  return (
    syntax.isClassOrInterface(parent) &&
    parent.name?.text === 'Leko' &&
    packageOf(declaration.getSourceFile().fileName) === PACKAGE
  )
}

/**
 * The declaration a node reads under the name `reached`, if it reads one at
 * all: `x.reached`, `x['reached']` (or a `const` key of that type), or the
 * `reached` of an object destructuring pattern.
 */
const reachedDeclaration = <N extends Node<N>>(
  node: N,
  syntax: Syntax<N>,
  checker: Checker<N>,
): N | undefined => {
  if (syntax.isPropertyAccess(node)) {
    return node.name.text === 'reached' ? checker.declarationOf(node.name) : undefined
  }
  if (syntax.isElementAccess(node)) {
    const key = checker.literalsOf(node.argumentExpression)
    if (key.length !== 1 || key[0] !== 'reached') return undefined
    return checker.propertyOf(node.expression, 'reached')
  }
  if (syntax.isBindingElement(node) && syntax.isObjectBindingPattern(node.parent)) {
    const property = node.propertyName ?? node.name
    const named = property !== undefined && syntax.isNamed(property) && property.text === 'reached'
    return named ? checker.propertyOf(node.parent, 'reached') : undefined
  }
  return undefined
}

/**
 * The names an argument can be, or `null` when the compiler cannot say.
 *
 * The type is asked rather than the syntax — `packages/codegen/README.md` says
 * what that buys. `reached(ORDER_SAVED)` where `ORDER_SAVED` is a `const`
 * resolves to the literal type `'order-saved'`, and
 * so does a value narrowed to a union of literals, which contributes all of its
 * arms. A `let`, a function parameter or a template with a hole in it widens to
 * `string`, and that is the case there is no honest answer for.
 */
const namesOf = <N>(argument: N, checker: Checker<N>): readonly string[] | null => {
  const parts = checker.literalsOf(argument)
  const names = parts.filter((part) => part !== undefined)
  return names.length > 0 && names.length === parts.length ? names : null
}

/**
 * Every signal name the programs report, gathered from the calls that report
 * them.
 *
 * A file can belong to more than one project, so each file is walked once, by
 * the first program that holds it.
 */
export function scan<N extends Node<N>>(
  programs: readonly Program<N>[],
  packageOf: (file: string) => string | undefined,
): ScanResult {
  const found = new Map<string, Site[]>()
  const unread: Site[] = []
  const seen = new Set<string>()

  for (const { files, syntax, checker } of programs) {
    for (const file of files) {
      if (seen.has(file.fileName)) continue
      seen.add(file.fileName)

      const at = (node: N): Site => ({
        file: file.fileName,
        line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      })

      const visit = (node: N): void => {
        if (isLekoReached(reachedDeclaration(node, syntax, checker), syntax, packageOf)) {
          const call = node.parent
          if (syntax.isPropertyAccess(node) && syntax.isCall(call) && call.expression === node) {
            const argument = call.arguments[0]
            const names = argument ? namesOf(argument, checker) : null
            if (names) {
              for (const name of names) found.set(name, [...(found.get(name) ?? []), at(call)])
            } else {
              unread.push(at(call))
            }
          } else {
            unread.push(at(node))
          }
        }
        node.forEachChild(visit)
      }

      file.forEachChild(visit)
    }
  }

  const signals = [...found.entries()]
    .map(([name, sites]) => ({ name, sites }))
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  return { signals, unread }
}
