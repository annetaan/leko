// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// The page judges itself: it draws the box, puts it through the six events,
// and says whether the box overlaps the hole after each. This script only asks
// it in more than one engine. Playwright's WebKit is a WebKit build rather than
// Safari; for Safari, open the page.

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)
  const result = await page.evaluate(() => window.spikeAnchoredBox.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}

const events = [
  'no room, cannot scroll',
  'no room, at scroll 0',
  'no room, scrolled first',
  'scrolled out of room',
  'words changed',
  'marker moved',
]
const range = ([a, b]) => `${a}–${b}`
const verdict = (c) => (c.onHole ? 'on the hole' : 'clear')

for (const r of results) {
  const missing = Object.entries(r.supported)
    .filter(([, yes]) => !yes)
    .map(([name]) => name)
  console.log(`\n${r.label} — ${r.ua}`)
  console.log(
    `  viewport ${r.viewport}${missing.length ? `, not supported: ${missing.join(', ')}` : ''}`,
  )
  console.log(
    `    ${'the hole'.padEnd(18)}` + r.rows[0].cells.map((c) => range(c.hole).padEnd(26)).join(''),
  )
  console.log(
    `    ${'scrolls'.padEnd(18)}` +
      r.rows[0].cells.map((c) => (c.scrolls ? 'yes' : 'no').padEnd(26)).join(''),
  )
  for (const row of r.rows) {
    console.log(
      `    ${row.label.padEnd(18)}` +
        row.cells.map((c) => `${range(c.box)} ${verdict(c)}`.padEnd(26)).join(''),
    )
  }
}

// The tables for the README: one per event, one row per spelling, one column
// per engine.
events.forEach((event, i) => {
  console.log(`\n### ${i + 1}. ${event[0].toUpperCase()}${event.slice(1)}\n`)
  console.log(`| spelling | ${results.map((r) => r.label).join(' | ')} |`)
  console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
  console.log(
    `| the hole | ${results.map((r) => `\`${range(r.rows[0].cells[i].hole)}\``).join(' | ')} |`,
  )
  results[0].rows.forEach((row, j) => {
    const cells = results.map((r) => {
      const c = r.rows[j].cells[i]
      return c.onHole ? `\`${range(c.box)}\` **on the hole**` : `\`${range(c.box)}\` clear`
    })
    console.log(`| ${row.label} | ${cells.join(' | ')} |`)
  })
})
