/*
 * Globals this package uses, declared here rather than by taking `lib.dom`,
 * which would let an element into a package whose whole point is not knowing
 * what one is.
 */

/**
 * `failed()` rethrows through this, so an application's exception lands
 * uncaught rather than as the unhandled rejection `Promise.resolve().then`
 * would give.
 */
declare function queueMicrotask(callback: () => void): void

/**
 * Never called. An unmatched `reached()` has to be free and silent, and the
 * test that pins that down needs something to watch.
 */
declare const console: { warn(...args: unknown[]): void }
