import type ts from 'typescript'

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

/** The package whose `Leko` counts. Everybody else's is somebody else's. */
const PACKAGE = '@annetaan/leko'

/**
 * The `Leko` class `@annetaan/leko` exports, as seen from `from`.
 *
 * Resolving the package and asking it for its own symbol is the only honest way
 * to answer this. Matching on the name `Leko` would count any class in the
 * project called that, and a false positive here puts a stranger's string into
 * the vocabulary. Reading the shape of the package instead, by looking for the
 * file that declares a class of that name with a `reached` on it, makes the
 * generator depend on how the core happens to be split into files today.
 *
 * It is resolved per importing file, because that is where module resolution
 * starts.
 */
const lekoClass = (
  from: ts.SourceFile,
  program: ts.Program,
  checker: ts.TypeChecker,
  tsm: typeof ts,
): ts.Symbol | null => {
  const options = program.getCompilerOptions()
  const resolved = tsm.resolveModuleName(PACKAGE, from.fileName, options, tsm.sys)
  const entry = resolved.resolvedModule?.resolvedFileName
  const file = entry ? program.getSourceFile(entry) : undefined
  const moduleSymbol = file ? checker.getSymbolAtLocation(file) : undefined
  if (!moduleSymbol) return null
  const exported = checker.getExportsOfModule(moduleSymbol).find((s) => s.name === 'Leko')
  if (!exported) return null
  // The entry point re-exports the class as a type, so the export is an alias
  // either way, and the declaration it points at is what a method's parent
  // will compare equal to.
  return exported.flags & tsm.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
}

/**
 * Whether `symbol` is the `reached` method of a Leko instance.
 *
 * Asking the checker where the method was declared is what a regular expression
 * cannot do. `queue.reached('x')` in the same file resolves to a different
 * declaration and is left alone.
 */
const isLekoReached = (
  symbol: ts.Symbol | undefined,
  leko: ts.Symbol,
  checker: ts.TypeChecker,
  tsm: typeof ts,
): boolean => {
  const declaration = symbol?.declarations?.[0]
  if (!declaration) return false
  if (!tsm.isMethodDeclaration(declaration) && !tsm.isMethodSignature(declaration)) return false
  const parent = declaration.parent
  if (!tsm.isClassDeclaration(parent) && !tsm.isInterfaceDeclaration(parent)) return false
  return parent.name !== undefined && checker.getSymbolAtLocation(parent.name) === leko
}

/**
 * The symbol a node reads under the name `reached`, if it reads one at all:
 * `x.reached`, `x['reached']` (or a `const` key of that type), or the
 * `reached` of an object destructuring pattern.
 */
const reachedSymbol = (
  node: ts.Node,
  checker: ts.TypeChecker,
  tsm: typeof ts,
): ts.Symbol | undefined => {
  if (tsm.isPropertyAccessExpression(node)) {
    return node.name.text === 'reached' ? checker.getSymbolAtLocation(node.name) : undefined
  }
  if (tsm.isElementAccessExpression(node)) {
    const key = checker.getTypeAtLocation(node.argumentExpression)
    if (!key.isStringLiteral() || key.value !== 'reached') return undefined
    return checker
      .getNonNullableType(checker.getTypeAtLocation(node.expression))
      .getProperty('reached')
  }
  if (tsm.isBindingElement(node) && tsm.isObjectBindingPattern(node.parent)) {
    const property = node.propertyName ?? node.name
    const named =
      (tsm.isIdentifier(property) || tsm.isStringLiteral(property)) && property.text === 'reached'
    return named ? checker.getTypeAtLocation(node.parent).getProperty('reached') : undefined
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
const namesOf = (argument: ts.Expression, checker: ts.TypeChecker): string[] | null => {
  const type = checker.getTypeAtLocation(argument)
  const parts = type.isUnion() ? type.types : [type]
  const names: string[] = []
  for (const part of parts) {
    if (!part.isStringLiteral()) return null
    names.push(part.value)
  }
  return names.length > 0 ? names : null
}

/**
 * Every signal name the programs report, gathered from the calls that report
 * them.
 *
 * A file can belong to more than one project, so each file is walked once, by
 * the first program that holds it.
 *
 * `tsm` is the TypeScript module itself. It arrives as an argument so that this
 * function stays something a test can drive, and so that a consumer's own
 * TypeScript is the one doing the work.
 */
export function scan(programs: readonly ts.Program[], tsm: typeof ts): ScanResult {
  const found = new Map<string, Site[]>()
  const unread: Site[] = []
  const seen = new Set<string>()

  for (const program of programs) {
    const checker = program.getTypeChecker()

    for (const file of program.getSourceFiles()) {
      if (file.isDeclarationFile || seen.has(file.fileName)) continue
      seen.add(file.fileName)
      const leko = lekoClass(file, program, checker, tsm)
      if (!leko) continue

      const at = (node: ts.Node): Site => ({
        file: file.fileName,
        line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
      })

      const visit = (node: ts.Node): void => {
        if (isLekoReached(reachedSymbol(node, checker, tsm), leko, checker, tsm)) {
          const call = node.parent
          if (
            tsm.isPropertyAccessExpression(node) &&
            tsm.isCallExpression(call) &&
            call.expression === node
          ) {
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
        tsm.forEachChild(node, visit)
      }

      visit(file)
    }
  }

  const signals = [...found.entries()]
    .map(([name, sites]) => ({ name, sites }))
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  return { signals, unread }
}
