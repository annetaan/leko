// Drives the real installed Chrome rather than bundled Chromium, so the result
// describes a browser somebody actually has.
//
//   node run.mjs                 # real Chrome
//   node run.mjs firefox         # Playwright's Gecko
//   node run.mjs webkit          # Playwright's WebKit — not Safari, see README
//
// The verdicts come from the page itself (`window.spikeResults`), so opening
// index.html by hand gives the same table without this script. That is the only
// way to get an answer about Safari.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const url = `file://${join(here, 'index.html')}`
const which = process.argv[2] ?? 'chrome'

const launch = {
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch(),
  chrome: () => chromium.launch({ channel: 'chrome' }),
}
const browser = await (launch[which] ?? launch.chrome)()

const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
page.on('pageerror', (e) => console.error('  page error:', e.message))

await page.goto(url)
await page.waitForFunction(() => window.spikeResults?.ready, null, { timeout: 15000 })
const spike = await page.evaluate(() => window.spikeResults)

console.log(`\n${spike.ua}\n`)
const tags = { pass: 'PASS  ', fail: 'FAIL  ', limit: 'LIMIT ', eye: 'EYE   ' }
for (const r of spike.results) {
  console.log(`${tags[r.status] ?? '?     '}${String(r.id).padEnd(5)} ${r.title}`)
  console.log(`             ${r.detail}\n`)
}

const count = (status) => spike.results.filter((r) => r.status === status).length
console.log(
  `${count('pass')} PASS / ${count('limit')} limits confirmed / ` +
    `${count('fail')} unexpected failures / ${count('eye')} to check by eye\n`,
)

// A screenshot for the calls that are made by eye, and for the record.
const shots = join(here, `shots-${which}`)
await page.screenshot({ path: join(shots, 'full.png'), fullPage: true })
for (const [name, selector] of [
  ['box-shadow', '#t4stage2'],
  ['clip-path', '#t5stage'],
]) {
  const el = await page.$(selector)
  if (el) await el.screenshot({ path: join(shots, `${name}.png`) })
}
console.log(`screenshots: ${shots}`)

await browser.close()
process.exit(spike.results.some((r) => r.status === 'fail') ? 1 : 0)
