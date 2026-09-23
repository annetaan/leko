// Drives index.html out to next.html two ways, reads what next.html found
// waiting for it, then walks back to index.html and reads what pageshow said
// about the return. Prints the same measurement as text and as README
// tables.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//   node run.mjs serve       # print the URL and wait; open it in Safari
//
// Serves the directory over node:http rather than opening either page as a
// file:// URL, the same reason the same-document spike gives: some engines
// refuse things this page needs on file://, and this one maps the request
// path to two files instead of the sibling's one.

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, firefox, webkit } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))

const FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/next.html': 'next.html',
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://internal/')
  const file = FILES[pathname]
  if (!file) {
    res.writeHead(404)
    res.end()
    return
  }
  const html = await readFile(join(here, file))
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
  console.log(
    'Open it in a real Safari: click the link, use Back to return, and read ' +
      'the tables both pages draw. Ctrl-C to stop.',
  )
  // Node's default SIGINT handling is enough to end the process; nothing
  // here needs to run first.
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

  // Out via a click on <a href>.
  await page.goto(url)
  await page.waitForFunction(() => window.spikeReady === true)
  await page.click('#next-link')
  await page.waitForFunction(() => window.spikeArrivedReady === true)
  const viaClick = await page.evaluate(() => window.spikeArrived.measure())

  // Out via location.assign(), from a fresh visit — sessionStorage's log key
  // is cleared on load, so the two ways out cannot see each other's records.
  await page.goto(url)
  await page.waitForFunction(() => window.spikeReady === true)
  await page.evaluate(() => window.spikeLeave.viaAssign())
  await page.waitForFunction(() => window.spikeArrivedReady === true)
  const viaAssign = await page.evaluate(() => window.spikeArrived.measure())

  // Back/forward cache: leave once more, then walk back and read what
  // index.html's own pageshow listener says about the page it is shown on.
  await page.goto(url)
  await page.waitForFunction(() => window.spikeReady === true)
  await page.click('#next-link')
  await page.waitForFunction(() => window.spikeArrivedReady === true)
  await page.goBack()
  // window.spikeReady is already true on a restored document — the same
  // top-level script ran once, before the freeze — and becomes true again
  // on a reload, so this waits correctly either way.
  await page.waitForFunction(() => window.spikeReady === true)
  const pageshow = await page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('leko-spike-cross-doc-pageshow') ?? '[]')
    } catch {
      return []
    }
  })

  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, viaClick, viaAssign, pageshow })
}
server.close()

const describe = (log) =>
  log.length === 0 ? 'nothing' : log.map((r) => `${r.source}:${r.type} (${r.when})`).join(', ')

const suspect = new Set(['currententrychange', 'popstate', 'hashchange'])
const sameDocumentEventsFired = (log) => log.some((r) => suspect.has(r.type))

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  for (const [name, measured] of [
    ['<a href> click', r.viaClick],
    ['location.assign()', r.viaAssign],
  ]) {
    console.log(`  ${name}`)
    console.log(`    navigation type on arrival: ${measured.navigationType}`)
    console.log(
      `    pagehide token: ${measured.tokenPresent ? `present, ${measured.tokenAge}ms old` : 'absent'}`,
    )
    console.log(
      `    same-document events (currententrychange/popstate/hashchange) fired: ${sameDocumentEventsFired(measured.log)}`,
    )
    console.log(`    log: ${describe(measured.log)}`)
  }
  console.log('  history.back() to index.html')
  console.log(
    `    pageshow: ${r.pageshow.map((p) => `persisted=${p.persisted}`).join(', ') || 'nothing recorded'}`,
  )
}

// The tables for the README.
console.log('\n### What fires in the leaving document, and when\n')
console.log(`| action | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
console.log(`| \`<a href>\` click | ${results.map((r) => describe(r.viaClick.log)).join(' | ')} |`)
console.log(
  `| \`location.assign()\` | ${results.map((r) => describe(r.viaAssign.log)).join(' | ')} |`,
)

console.log('\n### What the arriving document found\n')
console.log(`| | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
console.log(
  `| pagehide token (click) | ${results
    .map((r) => (r.viaClick.tokenPresent ? `present, ${r.viaClick.tokenAge}ms old` : '**absent**'))
    .join(' | ')} |`,
)
console.log(
  `| pagehide token (assign) | ${results
    .map((r) =>
      r.viaAssign.tokenPresent ? `present, ${r.viaAssign.tokenAge}ms old` : '**absent**',
    )
    .join(' | ')} |`,
)
console.log(
  `| \`performance\` navigation type (click) | ${results.map((r) => r.viaClick.navigationType).join(' | ')} |`,
)
console.log(
  `| \`performance\` navigation type (assign) | ${results.map((r) => r.viaAssign.navigationType).join(' | ')} |`,
)

console.log('\n### history.back() to index.html\n')
console.log(`| | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
console.log(
  `| \`pageshow.persisted\` | ${results
    .map((r) => r.pageshow.map((p) => p.persisted).join(', ') || 'nothing recorded')
    .join(' | ')} |`,
)
