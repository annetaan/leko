// Drives the real installed Chrome rather than bundled Chromium, so the result
// describes a browser somebody actually has.
//
//   node run.mjs                 # real Chrome
//   node run.mjs firefox         # Playwright's Gecko
//   node run.mjs webkit          # Playwright's WebKit — not Safari, see README
//
// The verdicts come from the page itself (`window.spikeResults`), so opening
// index.html by hand gives the same table without this script. That is the only
// way to get an answer about Safari, and — for M1 and M3 — the only way to get
// an answer at all: a screenshot taken over the DevTools protocol forces a
// repaint on the main thread and hides anything that only goes wrong on the
// compositor.

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

// 2x, because a wrong rasterisation scale is one of the two things this page is
// watching for and it does not show at 1x.
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.error('  page error:', e.message))

await page.goto(url)
await page.waitForFunction(() => window.spikeResults?.ready, null, { timeout: 15000 })

const shots = join(here, `shots-${which}`)
const shoot = async (name, selector) => {
  const el = await page.$(selector)
  if (el) await el.screenshot({ path: join(shots, `${name}.png`) })
}

// The overlap, at rest.
await shoot('overlap-clip', '#m1clip')
await shoot('overlap-mask', '#m1mask')

// And halfway through the opening, which is where the parity flip is worst.
await page.click('#m1play')
await page.waitForTimeout(430)
await shoot('opening-clip', '#m1clip')
await shoot('opening-mask', '#m1mask')
await page.waitForTimeout(600)

// The two routes that reference nothing, and even-odd beside them.
await shoot('routes', '#m67grid')
await page.click('#m67play')
await page.waitForTimeout(430)
await shoot('routes-opening', '#m67grid')
await page.waitForTimeout(600)

// Every spelling of the mask, side by side.
await shoot('spellings', '#m5grid')

// The hole 11 500px down.
await page.click('#m3deep')
await page.waitForTimeout(300)
await shoot('deep', '#m2grid')
await page.click('#m3top')

// The frame times, which the page judges itself.
await page.click('#m2run')
await page.waitForFunction(
  () => window.spikeResults.results.find((r) => r.id === 'M2')?.status !== 'eye',
  null,
  {
    timeout: 30000,
  },
)

const spike = await page.evaluate(() => window.spikeResults)
console.log(`\n${spike.ua}\ndevicePixelRatio ${spike.dpr}\n`)
const tags = { pass: 'PASS  ', fail: 'FAIL  ', limit: 'LIMIT ', eye: 'EYE   ' }
const plain = (s) => s.replace(/<[^>]+>/g, '')
for (const r of spike.results) {
  console.log(`${tags[r.status] ?? '?     '}${String(r.id).padEnd(4)} ${r.title}`)
  console.log(`             ${plain(r.detail)}\n`)
}

const count = (status) => spike.results.filter((r) => r.status === status).length
console.log(
  `${count('pass')} PASS / ${count('limit')} limits confirmed / ` +
    `${count('fail')} unexpected failures / ${count('eye')} to check by eye`,
)
console.log(`screenshots: ${shots}\n`)

await browser.close()
process.exit(spike.results.some((r) => r.status === 'fail') ? 1 : 0)
