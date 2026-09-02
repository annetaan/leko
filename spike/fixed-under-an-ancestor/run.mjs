// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// The page judges itself: it scrolls, reads where each fixed child went, and
// says which are still fixed. This script only asks it in more than one engine.
// Playwright's WebKit is a WebKit build rather than Safari; for Safari, open
// the page.

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
  const result = await page.evaluate(() => window.spikeFixed.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  for (const [i, row] of r.ancestors.entries()) {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${row.label.padEnd(30)} ${row.verdict.padEnd(10)}` +
        ` offsetParent ${row.offsetParent}`,
    )
  }
  console.log(
    `   S. under a transformed scroller  ${r.scroller.rides ? 'rides the scroller' : 'DOES NOT RIDE'}` +
      ` offsetParent ${r.scroller.offsetParent}`,
  )
}

// One table for the README: a row per wrapper, a column per engine, with the
// offsetParent answer beside each verdict because that is the second question.
console.log('')
const labels = results[0].ancestors.map((r) => r.label)
console.log(`| wrapper | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
labels.forEach((label, i) => {
  const cells = results.map((r) => {
    const row = r.ancestors[i]
    return `${row.verdict === 'fixed' ? 'fixed' : `**${row.verdict}**`} · \`${row.offsetParent}\``
  })
  console.log(`| \`${label}\` | ${cells.join(' | ')} |`)
})
console.log(
  `| fixed child under a transformed scroller | ${results
    .map(
      (r) =>
        (r.scroller.rides ? 'rides the scroller' : '**does not ride it**') +
        ` · \`${r.scroller.offsetParent}\``,
    )
    .join(' | ')} |`,
)
