/**
 * Assertions for the programs beside this file — ONBOARDING.md, **The codegen
 * loop**, is why there is more than one of them.
 */

/**
 * `true` only when the two types are the *same* type, rather than each merely
 * assignable to the other.
 *
 * The identity has to be that strict here: `string` and `'order-saved' | (string
 * & {})` accept exactly the same values, and telling them apart is the whole
 * assertion. Deferring both sides inside an unresolved conditional is what makes
 * the compiler compare them structurally instead.
 */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

/** Fails the build unless the type argument came out `true`. */
export const assertType = <_Assertion extends true>(): void => {}
