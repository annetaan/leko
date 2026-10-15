// Hands the page a screenshot of itself and prints what it read.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// A page cannot read its own pixels, so this script takes the screenshot and
// the page decodes it on a canvas and compares each hole with its reference
// itself; the script only asks in more than one engine and at more than one
// scale. Playwright's WebKit is a WebKit build rather than Safari; for Safari,
// open the page and look. The dip, case 3, is judged by eye and is not here.

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

// An ordinary screen and a high-density one. The question is about alpha, not
// edges, so the fractional scales have nothing to add.
const scales = [1, 2]

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const browser = await engine.launch()
  for (const scale of scales) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      deviceScaleFactor: scale,
    })
    const page = await context.newPage()
    page.on('pageerror', (e) => console.error('  page error:', e.message))
    await page.goto(url)
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    )
    const shot = await page.screenshot()
    const read = await page.evaluate(
      (dataUrl) => window.spikePartialOpacity.read(dataUrl),
      `data:image/png;base64,${shot.toString('base64')}`,
    )
    await context.close()
    results.push({ label: engine.label, scale, ...read })
  }
  await browser.close()
}

let seen = ''
let failed = 0
for (const r of results) {
  if (r.ua !== seen) console.log(`\n${r.label} — ${r.ua}`)
  seen = r.ua
  console.log(`  devicePixelRatio ${r.dpr}, tolerance ${r.tolerance} levels in 255`)
  for (const row of r.rows) {
    const said = row.offScreen
      ? 'off screen'
      : `${row.pass ? 'pass' : 'FAIL'}  hole ${row.hole.join(' ')}  reference ${row.reference.join(' ')}  (${row.diff} off)`
    if (!row.pass) failed++
    console.log(
      `    ${`${row.case} — ${row.sample}`.padEnd(48)} alpha ${String(row.alpha).padEnd(7)} ${said}`,
    )
  }
}

// The table for the README: samples passed out of all, and the largest
// difference from a reference, in levels out of 255.
console.log('\n| engine | scale | passed | largest difference |')
console.log('| --- | --- | --- | --- |')
for (const r of results) {
  const passed = r.rows.filter((row) => row.pass).length
  const worst = Math.max(...r.rows.map((row) => row.diff ?? 0))
  console.log(`| ${r.label} | ${r.dpr} | ${passed}/${r.rows.length} | ${worst} |`)
}

if (failed) process.exitCode = 1
