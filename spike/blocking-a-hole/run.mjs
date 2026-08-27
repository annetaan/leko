// Clicks the middle of each hole and reads which element took it.
//
// The page answers `elementFromPoint` on its own. A real click is the one input
// it cannot supply, and the wheel spike next door is the reason that difference
// is worth keeping: `elementFromPoint` and the engine do not always agree.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// Playwright's WebKit is a WebKit build rather than Safari. For Safari, open
// the page and click the three holes.

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

const verdictOf = (took) => (took === 'the rectangle' ? 'blocked' : 'OPEN')

async function measure(engine) {
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)

  const centres = await page.evaluate(() => window.spikeBlocking.centres())
  for (const [, [x, y]] of Object.entries(centres)) {
    await page.mouse.click(x, y)
  }

  const at = await page.evaluate(() => window.spikeBlocking.at())
  const took = await page.evaluate(() => window.spikeBlocking.clicked())
  const drift = await page.evaluate(() => window.spikeBlocking.drift())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  return { at, took, drift, ua }
}

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const { at, took, drift, ua } = await measure(engine)
  results.push({ label: engine.label, at, took, drift, ua })
  console.log(`\n${engine.label} — ${ua}`)
  if (drift > 1) console.log(`  a rectangle has drifted ${drift}px from its hole`)
  for (const which of Object.keys(at)) {
    console.log(
      `  ${which.padEnd(8)} elementFromPoint: ${(at[which] ?? '—').padEnd(14)}` +
        ` click: ${(took[which] ?? '—').padEnd(14)} — ${verdictOf(took[which])}`,
    )
  }
}

console.log('')
const columns = Object.keys(results[0].at)
console.log(`| | ${columns.map((c, i) => `${i + 1}. ${c}`).join(' | ')} |`)
console.log(`| --- | ${columns.map(() => '---').join(' | ')} |`)
for (const { label, took } of results) {
  console.log(`| ${label} | ${columns.map((c) => verdictOf(took[c])).join(' | ')} |`)
}

// Two ways a run can be worthless, both of which look like a clean table.
//
// A rectangle that has drifted off its hole reports that hole open for a reason
// that has nothing to do with the question.
const off = results.filter((r) => r.drift > 1).map((r) => `${r.label} (${r.drift}px)`)
// And the control has no rectangle at all, so if its click does not reach the
// button then the click is not landing and no other row means anything.
const control = results.filter((r) => r.took.none !== 'the button')

if (off.length > 0) console.error(`\nrectangles drifted off their holes in: ${off.join(', ')}`)
if (control.length > 0) {
  console.error(
    `\ncontrol panel did not take the click in: ${control.map((r) => r.label).join(', ')}` +
      ' — the click is not landing',
  )
}
if (off.length > 0 || control.length > 0) process.exit(1)
console.log('')
