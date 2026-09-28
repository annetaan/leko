// Hands the page a screenshot of itself at each scale and prints what it read.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// A page cannot read its own pixels, so this script takes the screenshot and
// the page decodes it on a canvas and judges each edge itself; the script only
// asks in more than one engine and at more than one scale. Playwright's WebKit
// is a WebKit build rather than Safari; for Safari, open the page and look.

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

// 1.25 and 1.5 are Windows' display scales and a page zoom's; 2 and 3 are
// every high-density screen.
const scales = [1, 1.25, 1.5, 2, 3]
const columns = [
  ['raw', 'raw'],
  ['css', 'whole CSS px'],
  ['device', 'device px'],
]

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
      (dataUrl) => window.spikeFractionalEdge.read(dataUrl),
      `data:image/png;base64,${shot.toString('base64')}`,
    )
    await context.close()
    results.push({ label: engine.label, scale, ...read })
  }
  await browser.close()
}

const verdict = (v) => {
  if (v.off) return 'off screen'
  const parts = ['gap', 'overlap', 'partial']
    .filter((k) => v.found[k].length)
    .map((k) => `${k} ${v.found[k].join(',')}`)
  const said = parts.length ? parts.join('; ') : 'flush'
  return v.between ? `${said} (surface between device pixels)` : said
}

let seen = ''
for (const r of results) {
  if (r.ua !== seen) console.log(`\n${r.label} — ${r.ua}`)
  seen = r.ua
  console.log(`  devicePixelRatio ${r.dpr}`)
  for (const row of r.cells) {
    const cells = row.columns.map((v) => verdict(v).padEnd(28)).join(' ')
    console.log(`    ${row.label.padEnd(30)} ${cells}`)
  }
}

// The table for the README: defective cases out of those on screen, then the
// pixels that were off, as gap / overlap / partial, then the largest step
// from the dimmed ground, out of 255.
console.log(`\n| engine | scale | ${columns.map(([, label]) => label).join(' | ')} |`)
console.log(`| --- | --- | ${columns.map(() => '---').join(' | ')} |`)
for (const r of results) {
  const cells = columns.map(([key]) => {
    const t = r.tally[key]
    const off = t.off ? `, ${t.off} off` : ''
    return `${t.defective}/${r.cases - t.off}${off} · ${t.gap}/${t.overlap}/${t.partial} · ${t.worst}`
  })
  console.log(`| ${r.label} | ${r.dpr} | ${cells.join(' | ')} |`)
}
