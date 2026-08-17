import { createLeko } from '@annetaan/leko'

export const leko = createLeko()

export async function placeOrder(): Promise<void> {
  await Promise.resolve()
  // A name written where it happens. This is the ordinary case.
  leko.reached('order-saved')
}
