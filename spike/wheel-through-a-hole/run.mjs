// Drives a wheel over each panel and reads what moved.
//
// The page cannot judge itself here — the input is a wheel — so this script
// supplies the input and the page supplies the measurement. Opening index.html
// and scrolling by hand gives the same three verdicts.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// Playwright's WebKit is a WebKit build rather than Safari — its user agent
// carries a `Version/` token all the same, and that token is not a Safari
// release anyone can install. For Safari, open the page and use the wheel.

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

// Deliberately shorter than the page. Chromium falls back to the element under
// the pointer whenever the page behind has nothing left to scroll, so a window
// tall enough to fit everything reports that all three engines are fine — which
// is how this bug survived a first round of testing.
const VIEWPORT = { width: 1100, height: 700 }

const verdictOf = ({ panel, page }) =>
  panel > 0 ? 'panel scrolls' : page > 0 ? 'THE PAGE SCROLLS' : 'nothing moved'

async function measure(engine) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: VIEWPORT })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)

  const ids = await page.$$eval('[data-case]', (els) => els.map((el) => el.dataset.case))
  const rows = []

  for (const id of ids) {
    // Between panels, not just at the start: the page scroll is shared, so a
    // panel that sent its wheel to the page would otherwise poison the next
    // reading.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.scroller')) el.scrollTop = 0
      document.scrollingElement.scrollTop = 0
    })

    const box = await page.locator(`[data-case="${id}"] .scroller`).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 320)
    // Smooth scrolling lands a few frames later on every engine.
    await page.waitForTimeout(500)

    const moved = await page.evaluate(
      (which) => ({
        panel: Math.round(document.querySelector(`[data-case="${which}"] .scroller`).scrollTop),
        page: Math.round(document.scrollingElement.scrollTop),
      }),
      id,
    )
    rows.push({ id, ...moved })
  }

  // The page checks that each overlay still matches the layout it was measured
  // from. A stale one hangs over the panel next to it, and the control panel is
  // the one it reaches first — so this is asked before the verdicts are trusted.
  const stale = await page.evaluate(() => window.spikeWheel?.check() ?? -1)
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  return { rows, ua, stale }
}

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const { rows, ua, stale } = await measure(engine)
  results.push({ label: engine.label, rows, ua, stale })
  console.log(`\n${engine.label} — ${ua}`)
  if (stale !== 0) console.log(`  overlays not matching their layout: ${stale}`)
  for (const [i, row] of rows.entries()) {
    console.log(
      `  ${i + 1}. ${row.id.padEnd(8)} panel ${row.panel}px · page ${row.page}px` +
        ` — ${verdictOf(row)}`,
    )
  }
}

console.log('')
// Numbered to match the headings on the page, so a run and a pair of eyes can
// be compared without anybody having to say which panel they meant.
const columns = results[0].rows.map((r, i) => `${i + 1}. ${r.id}`)
console.log(`| | ${columns.join(' | ')} |`)
console.log(`| --- | ${columns.map(() => '---').join(' | ')} |`)
for (const { label, rows } of results) {
  console.log(`| ${label} | ${rows.map(verdictOf).join(' | ')} |`)
}

// Two ways a run can be worthless, both of which look like a clean table.
//
// An overlay that no longer matches its layout overhangs the panel beside it,
// and the control is the panel it reaches first. That went unnoticed once, by
// ten pixels.
const drifted = results.filter((r) => r.stale !== 0).map((r) => `${r.label} (${r.stale})`)
// And the control has no overlay at all, so if its wheel does not reach the
// panel then the wheel is not landing and no other row means anything.
const control = results.filter((r) => r.rows.some((x) => x.id === 'none' && x.panel === 0))

if (drifted.length > 0) {
  console.error(`\noverlays not matching their layout in: ${drifted.join(', ')}`)
}
if (control.length > 0) {
  console.error(
    `\ncontrol panel did not scroll in: ${control.map((r) => r.label).join(', ')}` +
      ' — the wheel is not landing',
  )
}
if (drifted.length > 0 || control.length > 0) process.exit(1)
console.log('')
