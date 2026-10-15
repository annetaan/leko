import { createLeko } from '@annetaan/leko'

export const leko = createLeko()

export function placeOrder(): void {
  leko.reached('order-saved')
}
