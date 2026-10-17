/**
 * `LekoProblem` and `LekoState` are written out again in `@annetaan/leko-types`
 * rather than imported from the machine — DESIGN.md, **The packages, and the
 * seam between them**. `MachineOptions.onDiagnostic` is a method, so it is
 * checked bivariantly, and a kind added on only one side still compiles in
 * `leko.ts`. This program holds the two sides to one type.
 */
import type { LekoProblem, LekoState } from '@annetaan/leko'
import type { Machine } from '@annetaan/leko-machine'
import type { LekoWorld } from '@annetaan/leko-types'
import { assertType, type Equal } from './assert.js'

type MachineProblem = Parameters<
  NonNullable<ConstructorParameters<typeof Machine<LekoWorld>>[0]['onDiagnostic']>
>[0]

assertType<Equal<LekoProblem, MachineProblem>>()
assertType<Equal<LekoState, Machine<LekoWorld>['state']>>()
