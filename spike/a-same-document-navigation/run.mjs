// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//   node run.mjs serve       # print the URL and wait; open it in Safari
//
// The page runs each action once on load, records what fired, and draws its
// own table; this script asks the same window.spikeNavigation.measure() in
// more than one engine and prints it again as text and as README tables. It
// serves index.html over node:http rather than opening it as a file:// URL,
// because pushState is refused on file:// in some engines and the point of
// this page is pushState. Playwright's WebKit is a WebKit build rather than
// Safari; `serve` is for reading the page's own table in an actual Safari —
// see the README's Safari section.

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
  console.log('Open it in a real Safari and read the table it draws. Ctrl-C to stop.')
  // Node's default SIGINT handling is enough to end the process; nothing here
  // needs to run first.
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
  await page.waitForFunction(() => window.spikeNavigationReady === true)
  const result = await page.evaluate(() => window.spikeNavigation.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}
server.close()

const describe = (fired) =>
  fired.length === 0 ? 'nothing' : fired.map((f) => `${f.type} (${f.when})`).join(', ')

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  console.log(`  'navigation' in window: ${r.hasNavigationApi}`)
  for (const row of r.results) {
    console.log(`  ${row.name}`)
    console.log(`    ${row.before} -> ${row.after}`)
    if (row.fired.length === 0) {
      console.log('    (nothing fired)')
      continue
    }
    for (const f of row.fired) {
      console.log(`    ${f.source}:${f.type.padEnd(18)} ${f.when.padEnd(5)} location ${f.location}`)
    }
  }
}

// The tables for the README.
console.log('\n### What fires, and when\n')
console.log(`| action | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
results[0].results.forEach((row, i) => {
  const cells = results.map((r) => describe(r.results[i].fired))
  console.log(`| ${row.name} | ${cells.join(' | ')} |`)
})

console.log('\n### The Navigation API\n')
console.log(`| | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
console.log(
  `| \`'navigation' in window\` | ${results
    .map((r) => (r.hasNavigationApi ? 'yes' : '**no**'))
    .join(' | ')} |`,
)
