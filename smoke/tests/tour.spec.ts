import { expect, test } from '@playwright/test'

test('the tour is drawn, the save ends it, and nothing logs an error', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.locator('.leko-scrim')).toHaveCount(1)

  await page.click('#save')
  await expect(page.locator('.leko-scrim')).toHaveCount(0)

  expect(errors).toEqual([])
})
