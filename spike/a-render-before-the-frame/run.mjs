// Reads the page's own measurement off each engine and prints it as tables.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//   node run.mjs serve       # print the URL and wait; open it in Safari
//
// The page runs its trials once on load and draws its own tables; this script
// asks the same window.spikeFrame.measure() in more than one engine and prints
// it again as text and as README tables. Playwright's WebKit is a WebKit build
// rather than Safari; `serve` is for reading the page's own tables in an
// actual Safari.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))

const server = createServer(async (_req, res) => {
  const html = await readFile(join(here, 'index.html'))
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const url = `http://127.0.0.1:${port}/`

const engines = {
  chromium: { label: 'Chromium', launch: () => chromium.launch() },
  firefox: { label: 'Firefox', launch: () => firefox.launch() },
  webkit: { label: 'WebKit', launch: () => webkit.launch() },
  chrome: { label: 'Chrome', launch: () => chromium.launch({ channel: 'chrome' }) },
}

const asked = process.argv[2]

if (asked === 'serve') {
  console.log(`Serving ${url}`)
  console.log('Open it in a real Safari and read the tables it draws. Ctrl-C to stop.')
  await new Promise(() => {}) // held open until Ctrl-C
}

if (asked && !engines[asked]) {
  console.error(`unknown engine "${asked}" — one of ${Object.keys(engines).join(', ')}, or serve`)
  server.close()
  process.exit(2)
}
const chosen = asked ? [asked] : ['chromium', 'firefox', 'webkit']

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const browser = await engine.launch()
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)
  await page.waitForFunction(() => window.spikeFrameReady === true, null, { timeout: 120_000 })
  const result = await page.evaluate(() => window.spikeFrame.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}
server.close()

const variants = Object.keys(results[0].loads.idle.counts)
const loads = Object.keys(results[0].loads)
const ms = (v) => `${v.toFixed(1)}ms`

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  for (const load of loads) {
    const { counts, interval } = r.loads[load]
    console.log(`  ${load}, mean ${ms(interval)} between frames`)
    console.log(`    ${'variant'.padEnd(24)} before 1  before 2  after 2`)
    for (const v of variants) {
      const [a, b, c] = counts[v]
      console.log(`    ${v.padEnd(24)} ${String(a).padEnd(9)} ${String(b).padEnd(9)} ${String(c)}`)
    }
  }
  console.log(`  microtask held: ${r.microtaskHeld}; verdict: ${r.verdict.text}`)
}

// The tables for the README. A cell is "before frame 1 / before frame 2 /
// after frame 2", as counts out of the trials per variant.
for (const load of loads) {
  console.log(`\n### ${load}\n`)
  console.log(`| variant | ${results.map((r) => r.label).join(' | ')} |`)
  console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
  for (const v of variants) {
    console.log(
      `| \`${v}\` | ${results.map((r) => r.loads[load].counts[v].join(' / ')).join(' | ')} |`,
    )
  }
  console.log(`| frame interval | ${results.map((r) => ms(r.loads[load].interval)).join(' | ')} |`)
}
