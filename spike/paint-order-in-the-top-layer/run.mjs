// Opens the page and reads which square of each pair paints on top.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// Playwright's WebKit is a WebKit build rather than Safari. For Safari, open the
// page: it reads its own answer on load.

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

  const rows = await page.evaluate(() => window.spikePaintOrder.results())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  return { rows, ua }
}

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const { rows, ua } = await measure(engine)
  const kept = rows.every((r) => r.top === r.expected)
  results.push({ label: engine.label, kept })
  console.log(`\n${engine.label} — ${ua}`)
  rows.forEach(({ question, top, expected }, i) => {
    const verdict = top === expected ? 'show order' : `${top} ON TOP, NOT SHOW ORDER`
    console.log(`  ${i + 1}. ${question}`)
    console.log(`     on top: ${top}, shown last: ${expected} — ${verdict}`)
  })
}

console.log('')
console.log('| | Verdict |')
console.log('| --- | --- |')
for (const { label, kept } of results) {
  console.log(`| ${label} | ${kept ? 'show order, all four' : '**not show order**'} |`)
}
console.log('')
