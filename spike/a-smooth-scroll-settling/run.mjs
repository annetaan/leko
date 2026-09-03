// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//   node run.mjs --headed    # windows on screen
//
// The page drives one scroll at a time and watches it from a rAF loop; this
// script only asks in more than one engine. Playwright's WebKit is a WebKit
// build rather than Safari; for Safari, open the page.
//
// Headless is honest for this one. A smooth scroll is an animation on the
// compositor and nothing here is judged by eye, so the numbers do not need a
// window on screen — unlike `the-scrollbar-gutter/`, which cannot be measured
// headless at all. `--headed` is there to check that.

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
  const result = await page.evaluate(() => window.spikeSmooth.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}

const ms = (v) => (v === null ? '—' : `${Math.round(v)}ms`)
const arrived = (r, distance) => Math.abs(r.landed - distance) <= 1
const INTERRUPTIONS = {
  stop: 'set to where it is',
  by: 'a second glide, `scrollBy` a delta',
  to: 'a second glide, `scrollTo` an offset',
}

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  console.log(`  'onscrollend' in window: ${r.supported} · viewport ${r.viewport}px`)
  for (const row of r.smooth) {
    const there = arrived(row.result, row.distance)
    console.log(
      `  ${row.label.padEnd(24)} ${String(`${row.distance}px`).padEnd(8)}` +
        ` ${there ? `settled ${ms(row.result.stoppedAt)}`.padEnd(15) : 'NEVER MOVED   '}` +
        ` scrollend ${ms(row.result.endedAt).padEnd(7)}` +
        ` left at 320ms ${String(Math.round(row.result.leftAtMorph)).padStart(5)}px` +
        ` (${Math.round((row.result.leftAtMorph / row.distance) * 100) || 0}%)`,
    )
  }
  console.log('  a panel 1200px down its own list, by how far down the page it sits:')
  for (const row of r.sweep) {
    console.log(
      `    panel at ${String(row.top).padStart(5)}px` +
        ` ${(row.showing ? 'on screen' : `past the fold ${row.fold}px`).padEnd(22)}` +
        ` smooth ${String(row.glided.landed).padStart(5)}px${arrived(row.glided, 1200) ? '  ' : ' !'}` +
        ` steps ${String(row.glided.steps).padStart(3)}` +
        ` scrollend ${(row.glided.endedAt === null ? 'never' : ms(row.glided.endedAt)).padEnd(7)}` +
        ` set ${String(row.set.landed).padStart(5)}px`,
    )
  }
  console.log('  a 5000px glide interrupted 100ms in:')
  for (const i of [r.interrupted.stop, r.interrupted.by, r.interrupted.to]) {
    console.log(
      `    ${INTERRUPTIONS[i.kind].padEnd(36)}` +
        ` was at ${String(Math.round(i.at)).padStart(5)}px` +
        ` landed ${String(Math.round(i.landed)).padStart(5)}px` +
        ` wanted ${String(Math.round(i.wanted)).padStart(5)}px` +
        `${Math.abs(i.landed - i.wanted) <= 1 ? '  ' : ' !'}` +
        ` scrollend ${i.endedAt === null ? 'never' : ms(i.endedAt)}`,
    )
  }
  console.log(
    `  already there: moved ${Math.round(r.already.landed)}px · scrollend ${ms(r.already.endedAt)}`,
  )
  console.log(
    `  outright, 2000px: settled ${ms(r.instant.stoppedAt)} · scrollend ${ms(r.instant.endedAt)}`,
  )
}

// The tables for the README.
console.log('')
console.log(`| scroll | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
for (const [i, row] of results[0].smooth.entries()) {
  const cells = results.map((r) => {
    const s = r.smooth[i].result
    if (!arrived(s, r.smooth[i].distance)) return '**never moved**'
    const left = Math.round(s.leftAtMorph)
    return `${ms(s.stoppedAt)} · ${left > 8 ? `**${left}px left**` : `${left}px left`}`
  })
  console.log(`| ${row.label}, ${row.distance}px | ${cells.join(' | ')} |`)
}

console.log('')
console.log(`| | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
console.log(
  `| \`'onscrollend' in window\` | ${results.map((r) => (r.supported ? 'yes' : '**no**')).join(' | ')} |`,
)
for (const [i, row] of results[0].smooth.entries()) {
  const cells = results.map((r) => {
    const s = r.smooth[i].result
    if (!s.started) return 'nothing moved'
    return s.endedAt === null
      ? '**never**'
      : `${ms(s.endedAt)} (+${Math.round(s.endedAt - s.stoppedAt)}ms)`
  })
  console.log(`| ${row.label}, ${row.distance}px | ${cells.join(' | ')} |`)
}
console.log(`| outright, 2000px | ${results.map((r) => ms(r.instant.endedAt)).join(' | ')} |`)
console.log(
  `| already there | ${results
    .map((r) => (r.already.endedAt === null ? 'never — and nothing moved' : ms(r.already.endedAt)))
    .join(' | ')} |`,
)

console.log('')
console.log(`| panel past the fold by | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
for (const [i, row] of results[0].sweep.entries()) {
  const cells = results.map((r) => {
    const s = r.sweep[i]
    const g = arrived(s.glided, 1200)
    return (
      `${g ? `${ms(s.glided.endedAt)}` : '**never moved**'} · ` +
      `set ${arrived(s.set, 1200) ? 'lands' : '**fails**'}`
    )
  })
  const label = row.showing
    ? `on screen (panel at ${row.top})`
    : `${row.fold}px past the fold (panel at ${row.top})`
  console.log(`| ${label} | ${cells.join(' | ')} |`)
}

console.log('')
console.log(`| a 5000px glide, 100ms in | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
for (const kind of ['stop', 'by', 'to']) {
  const cells = results.map((r) => {
    const i = r.interrupted[kind]
    const held = Math.abs(i.landed - i.wanted) <= 1
    const where =
      kind === 'stop'
        ? held
          ? `stays at ${Math.round(i.at)}px`
          : `**leaves ${Math.round(i.at)}px for ${Math.round(i.landed)}px**`
        : held
          ? `lands at ${Math.round(i.landed)}px`
          : `**lands at ${Math.round(i.landed)}px**`
    return `${where} · scrollend ${i.endedAt === null ? '**never**' : ms(i.endedAt)}`
  })
  console.log(
    `| ${INTERRUPTIONS[kind]}${kind === 'stop' ? '' : ', to 800px'} | ${cells.join(' | ')} |`,
  )
}
