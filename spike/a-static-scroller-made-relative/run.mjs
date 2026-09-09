// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// The page judges itself: it measures five children of a static scroller,
// gives the scroller `position: relative`, measures again, and scrolls the
// panel to see which children ride it. This script only asks it in more than
// one engine. Playwright's WebKit is a WebKit build rather than Safari; for
// Safari, open the page.

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
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)
  const result = await page.evaluate(() => window.spikeRelative.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}

const cell = (r) =>
  `${r.moved ? `**moved ${r.delta}**` : 'same'} · ${r.rodeBefore ? 'rides' : 'stays'} → ${r.rodeAfter ? 'rides' : 'stays'}`

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua} (panel was ${r.position})`)
  for (const row of r.rows) {
    console.log(
      `  ${row.label.padEnd(28)} ${(row.moved ? `moved ${row.delta}` : 'same').padEnd(20)}` +
        ` rides the scroll: ${row.rodeBefore ? 'rides' : 'stays'} → ${row.rodeAfter ? 'rides' : 'stays'}`,
    )
  }
}

// One table for the README: a row per child, a column per engine.
console.log('')
console.log(`| child | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
results[0].rows.forEach((row, i) => {
  console.log(`| ${row.label} | ${results.map((r) => cell(r.rows[i])).join(' | ')} |`)
})
