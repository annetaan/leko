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
   * `reached(`step-${i}`)`, or a name arriving from outside the project.
   *
   * These are the reason `--loose` exists. A vocabulary gathered from a project
   * that builds names at runtime is incomplete by construction, and a strict
   * `awaits` on top of an incomplete vocabulary rejects steps that are right.
   */
  dynamic: Site[]
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
 * Whether `access` is the `reached` method of a Leko instance.
 *
 * Asking the checker where the method was declared is what a regular expression
 * cannot do. `queue.reached('x')` in the same file resolves to a different
 * declaration and is left alone.
 */
const isLekoReached = (
  access: ts.PropertyAccessExpression,
  leko: ts.Symbol | null,
  checker: ts.TypeChecker,
  tsm: typeof ts,
): boolean => {
  if (!leko || access.name.text !== 'reached') return false
  const symbol = checker.getSymbolAtLocation(access.name)
  const declaration = symbol?.declarations?.[0]
  if (!declaration) return false
  if (!tsm.isMethodDeclaration(declaration) && !tsm.isMethodSignature(declaration)) return false
  const parent = declaration.parent
  if (!tsm.isClassDeclaration(parent) && !tsm.isInterfaceDeclaration(parent)) return false
  return parent.name !== undefined && checker.getSymbolAtLocation(parent.name) === leko
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
 * Every signal name the program reports, gathered from the calls that report
 * them.
 *
 * `tsm` is the TypeScript module itself. It arrives as an argument so that this
 * function stays something a test can drive, and so that a consumer's own
 * TypeScript is the one doing the work.
 */
export function scan(program: ts.Program, tsm: typeof ts): ScanResult {
  const checker = program.getTypeChecker()
  const found = new Map<string, Site[]>()
  const dynamic: Site[] = []

  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue
    const leko = lekoClass(file, program, checker, tsm)
    if (!leko) continue

    const at = (node: ts.Node): Site => ({
      file: file.fileName,
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    })

    const visit = (node: ts.Node): void => {
      if (tsm.isCallExpression(node) && tsm.isPropertyAccessExpression(node.expression)) {
        if (isLekoReached(node.expression, leko, checker, tsm)) {
          const argument = node.arguments[0]
          const names = argument ? namesOf(argument, checker) : null
          if (names) {
            for (const name of names) found.set(name, [...(found.get(name) ?? []), at(node)])
          } else {
            dynamic.push(at(node))
          }
        }
      }
      tsm.forEachChild(node, visit)
    }

    visit(file)
  }

  const signals = [...found.entries()]
    .map(([name, sites]) => ({ name, sites }))
    .toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  return { signals, dynamic }
}
