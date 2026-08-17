import { leko } from './checkout.js'
import { EITHER, REPORT_EXPORTED } from './names.js'

export function exportReport(): void {
  leko.reached(REPORT_EXPORTED)
  leko.reached(EITHER)
}
