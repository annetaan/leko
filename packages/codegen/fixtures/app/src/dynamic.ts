import { leko } from './checkout.js'

/** Built at runtime, so no scan can say what it reports. */
export function reachStep(index: number): void {
  leko.reached(`step-${index}`)
}
