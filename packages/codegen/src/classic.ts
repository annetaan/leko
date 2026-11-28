import type ts from 'typescript'

import type { Program } from './scan.js'

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
