// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//   node run.mjs --headed    # windows on screen, which is where a gutter is
//
// The page judges itself: it lays fixed boxes wider than the layout viewport
// over the page and reads whether the document grew, then makes the page tall
// and short and counts what noticed. This script only asks in more than one
// engine. Playwright's WebKit is a WebKit build rather than Safari; for Safari,
// open the page.
//
// A headless browser has no scrollbar to reserve space for, in any engine and
// whatever the platform is set to, so `--headed` is the only way to get a
// gutter into these columns — and even then only where the operating system
// draws classic scrollbars. Question 1 does not wait for that: its widths are
// over the layout viewport by 40 and 400, which is the same question with the
// platform taken out of it.
//
// The paint question is not this script's to answer. Whether the scrollbar
// paints over a box covering its gutter has to be judged by eye: Firefox's
// screenshot does not carry the scrollbar at all, so red reaching the edge of
// one is evidence about the screenshot rather than about the engine.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const url = `file://${join(here, 'index.html')}`

const argv = process.argv.slice(2)
const headless = !argv.includes('--headed')

const engines = {
  chromium: { label: 'Chromium', launch: () => chromium.launch({ headless }) },
  firefox: { label: 'Firefox', launch: () => firefox.launch({ headless }) },
  webkit: { label: 'WebKit', launch: () => webkit.launch({ headless }) },
  chrome: { label: 'Chrome', launch: () => chromium.launch({ channel: 'chrome', headless }) },
}

const asked = argv.find((a) => !a.startsWith('--'))
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
  const result = await page.evaluate(() => window.spikeGutter.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}

console.log(headless ? '\nheadless — no scrollbar, so no gutter in any column' : '\nheaded')

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  console.log(
    `  gutter ${r.gutterWidth}px` +
      `${r.gutterWidth === 0 ? ' — overlay scrollbars, so nothing here is about the scrollbar itself' : ''}`,
  )
  for (const o of r.overflow) {
    console.log(
      `  ${o.label.padEnd(34)} ${String(`${o.width}×${o.height}`).padEnd(11)}` +
        ` scroll ${o.scrollWidth}×${o.scrollHeight}` +
        ` reach ${o.reach}` +
        `${o.grewWidth || o.grewHeight ? `  GREW BY ${o.grewWidth}×${o.grewHeight}` : ''}` +
        `${o.grewX ? '  GREW A SCROLLBAR' : ''}` +
        `${o.reach < o.width ? '  CLIPPED' : ''}`,
    )
  }
  for (const n of r.notice) {
    console.log(
      `  ${n.label.padEnd(20)} clientWidth ${n.clientWidthBefore} → ${n.clientWidthAfter}` +
        `  resize ${n.resizes}  observed ${n.observed}${n.observed === 0 ? '  MISSED IT' : ''}`,
    )
  }
}

// Two tables for the README: the overflow claim, then what noticed the change.
const say = (ok, good, bad) => (ok ? good : `**${bad}**`)

console.log('')
console.log(
  `| fixed box | ${results.map((r) => `${r.label} (gutter ${r.gutterWidth}px)`).join(' | ')} |`,
)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
for (const [i, row] of results[0].overflow.entries()) {
  const cells = results.map((r) => {
    const o = r.overflow[i]
    const grew = o.grewWidth === 0 && o.grewHeight === 0 && !o.grewX
    const clipped = o.reach < o.width
    return (
      say(grew, 'no overflow', `grew ${o.grewWidth}×${o.grewHeight}`) +
      ` · ${say(!clipped, `reaches ${o.reach}`, `clipped to ${o.reach}`)}`
    )
  })
  console.log(`| ${row.label} (${row.width}×${row.height}) | ${cells.join(' | ')} |`)
}

console.log('')
console.log(
  `| transition | ${results.map((r) => `${r.label} (gutter ${r.gutterWidth}px): clientWidth · resize · RO`).join(' | ')} |`,
)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
for (const [i, n] of results[0].notice.entries()) {
  const cells = results.map((r) => {
    const row = r.notice[i]
    return (
      `${row.clientWidthBefore} → ${row.clientWidthAfter} · ` +
      `${row.resizes} · ${say(row.observed > 0, `${row.observed}`, `${row.observed}, missed`)}`
    )
  })
  console.log(`| ${n.label} | ${cells.join(' | ')} |`)
}
