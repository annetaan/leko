// Asks each engine what the page asks, hands it a screenshot of itself for the
// hole, and prints what it said.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// The page judges itself. A page cannot read its own pixels, so this script
// takes the screenshot and the page decodes it on a canvas to say whether the
// mask cut the holes; the script only asks in more than one engine.
// Playwright's WebKit is a WebKit build rather than Safari; for Safari, open
// the page and look.

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

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const browser = await engine.launch()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  const shot = await page.screenshot()
  const read = await page.evaluate(
    (dataUrl) => window.spikeSupportFloor.read(dataUrl),
    `data:image/png;base64,${shot.toString('base64')}`,
  )
  const version = browser.version()
  await browser.close()
  results.push({ label: engine.label, version, ...read })
}

for (const r of results) {
  console.log(`\n${r.label} ${r.version} — ${r.ua}`)
  console.log(`  viewport ${r.viewport}`)
  console.log(`  tour: ${r.verdicts.tour}`)
  console.log(`  scroll: ${r.verdicts.scroll}`)
  console.log(`  optional: ${r.verdicts.optional}`)
}

// The table for the README: one row per item, one column per engine.
const entry = (row) => (row.entries.length === 2 ? 'both' : row.entries[0])
const cell = (row) => (row.detail ? `${row.status}: ${row.detail}` : row.status)
console.log(`\n| item | needed by | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | --- | ${results.map(() => '---').join(' | ')} |`)
results[0].rows.forEach((row, i) => {
  const cells = results.map((r) => cell(r.rows[i]))
  console.log(`| \`${row.name}\` | ${entry(row)} | ${cells.join(' | ')} |`)
})
