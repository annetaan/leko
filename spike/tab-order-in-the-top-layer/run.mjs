// Presses Tab seven times and reads the order focus took.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// Playwright's WebKit is a WebKit build rather than Safari. For Safari, open the
// page and hold Tab down.
//
// Firefox on macOS only tabs to buttons when "Keyboard navigation" is on in the
// system settings, and Playwright's Firefox has it on. A hand run in a Firefox
// that does not will stop at the first button, which is a fact about macOS
// rather than about the top layer.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const url = `file://${join(here, 'index.html')}`

const engines = {
  chromium: { label: 'Chromium', launch: () => chromium.launch() },
  firefox: { label: 'Firefox', launch: () => firefox.launch() },
  webkit: { label: 'WebKit', launch: () => webkit.launch() },
  chrome: { label: 'Chrome', launch: () => chromium.launch({ channel: 'chrome' }) },
}

const asked = process.argv[2]
if (asked && !engines[asked]) {
  console.error(`unknown engine "${asked}" — one of ${Object.keys(engines).join(', ')}`)
  process.exit(2)
}
const chosen = asked ? [asked] : ['chromium', 'firefox', 'webkit']

async function measure(engine) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)

  await page.locator('#one').focus()
  // One more press than there are buttons, so a ring that wraps is seen to wrap
  // rather than looking like it stopped.
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('Tab')

  const ids = await page.evaluate(() => window.spikeTabOrder.ids())
  const seen = await page.evaluate(() => window.spikeTabOrder.seen())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  return { ids, seen, ua }
}

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const { ids, seen, ua } = await measure(engine)
  const kept = seen.join() === ids.join()
  results.push({ label: engine.label, kept, seen, ids })
  console.log(`\n${engine.label} — ${ua}`)
  console.log(`  dom:  ${ids.join(' → ')}`)
  console.log(`  tab:  ${seen.join(' → ')}`)
  console.log(`  ${kept ? 'DOM position kept' : 'MOVED BY THE TOP LAYER'}`)
}

console.log('')
console.log('| | Verdict |')
console.log('| --- | --- |')
for (const { label, kept } of results) {
  console.log(`| ${label} | ${kept ? 'DOM position kept' : '**moved**'} |`)
}

// A run where Tab never left the first button says nothing about the top layer.
// It says the engine is not tabbing to buttons at all, which macOS does to
// Firefox and Safari unless a system setting is on.
const stuck = results.filter((r) => r.seen.length < r.ids.length)
if (stuck.length > 0) {
  console.error(
    `\ntab did not reach every button in: ${stuck.map((r) => r.label).join(', ')}` +
      ' — check the system keyboard-navigation setting before reading anything above',
  )
  process.exit(1)
}
console.log('')
