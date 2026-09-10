// Reads the page's own measurement off each engine and prints it as a table.
//
//   node run.mjs             # Playwright's Chromium, Firefox and WebKit
//   node run.mjs chrome      # the real installed Chrome
//   node run.mjs webkit      # one engine on its own
//
// The page judges itself: it scrolls, watches whether the sticky element moved,
// and says whether the one number a library could read agrees. This script only
// asks it in more than one engine. Playwright's WebKit is a WebKit build rather
// than Safari; for Safari, open the page.

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

const results = []
for (const key of chosen) {
  const engine = engines[key]
  const browser = await engine.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.error('  page error:', e.message))
  await page.goto(url)
  const result = await page.evaluate(() => window.spikeSticky.measure())
  const ua = await page.evaluate(() => navigator.userAgent)
  await browser.close()
  results.push({ label: engine.label, ua, ...result })
}

const names = ['offset', 'inset', 'static']
// A pinned element sits *on* its inset, so zero is the pinned answer there and
// the riding one for the other two. The page reads them the same way.
const zeroIsPinned = { offset: false, inset: true, static: false }
const near = (n) => Math.abs(n) < 0.5
const says = (name, value) => (zeroIsPinned[name] ? near(value) : !near(value))
const right = (name, row) =>
  row.candidates[name] !== null && says(name, row.candidates[name]) === row.held
const state = (row) => (row.held ? 'pinned' : 'riding')

for (const r of results) {
  console.log(`\n${r.label} — ${r.ua}`)
  for (const [name, rows] of [
    ['1. in the page', r.doc],
    ['2. in a scroller', r.panel],
  ]) {
    console.log(`  ${name}`)
    for (const row of rows) {
      const cells = names
        .map(
          (n) =>
            `${n} ${String(row.candidates[n]).padStart(6)} ${right(n, row) ? '  ok' : 'WRONG'}`,
        )
        .join('  ')
      console.log(
        `    ${row.label.padEnd(26)} at ${String(row.at).padStart(5)}` +
          `  rect ${String(row.rectTop).padStart(7)}  offsetTop ${String(row.offsetTop).padStart(6)}` +
          `  ${state(row).padEnd(7)}  ${cells}`,
      )
    }
  }
  console.log('  3. a layer glued to a scrollport')
  for (const row of r.glue.rows) {
    console.log(
      `    ${row.label.padEnd(26)} at ${row.at.padEnd(12)} dx ${String(row.dx).padStart(6)}` +
        ` dy ${String(row.dy).padStart(6)}  ${row.size.padEnd(11)} ${row.glued ? 'glued' : 'DRIFTED'}`,
    )
  }
  console.log(
    `    scrollable area            ${r.glue.grew.before} → ${r.glue.grew.after}` +
      `  ${r.glue.grew.same ? 'unchanged' : 'GREW'}`,
  )
  console.log('  4. the pin predicted from one reading')
  for (const row of r.pin) {
    console.log(
      `    ${row.label.padEnd(36)} read at ${String(row.from).padStart(5)}` +
        `  pin at ${String(row.predicted).padStart(5)}` +
        `  3px short ${(row.shortHeld ? 'pinned' : 'riding').padEnd(6)}` +
        `  2px past ${(row.pastHeld ? 'pinned' : 'riding').padEnd(6)}  ${row.right ? 'ok' : 'WRONG'}`,
    )
  }
  console.log(`  6. a padded scroller (padding ${r.padding.pad})`)
  for (const row of r.padding.rows) {
    console.log(
      `    ${row.label.padEnd(46)} at ${row.at.padEnd(12)} dx ${String(row.dx).padStart(6)}` +
        ` dy ${String(row.dy).padStart(6)}  rests on ${row.rests.padEnd(16)}` +
        `  ${row.rests === row.want ? 'ok' : `WRONG — expected ${row.want}`}`,
    )
  }
  console.log('  5. scrollIntoView({ block: "nearest" })')
  for (const row of r.intoView) {
    console.log(
      `    ${row.label.padEnd(36)} ${String(row.before).padStart(6)} → ${String(row.after).padStart(6)}` +
        `  ${row.moved ? 'moved ' : 'stayed'}  ends ${row.pinned ? 'pinned' : 'riding'}`,
    )
  }
}

// The tables for the README: one row per state, one column per engine.
const table = (title, pick) => {
  console.log(`\n### ${title}\n`)
  console.log(`| state | ${results.map((r) => r.label).join(' | ')} |`)
  console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
  pick(results[0]).forEach((row, i) => {
    const cells = results.map((r) => {
      const cell = pick(r)[i]
      const verdicts = names
        .map((n) => `${n} \`${cell.candidates[n]}\`${right(n, cell) ? '' : ' **wrong**'}`)
        .join(', ')
      return `**${state(cell)}** · ${verdicts}`
    })
    console.log(`| ${row.label} | ${cells.join(' | ')} |`)
  })
}

table('1. A sticky header in the page', (r) => r.doc)
table('2. A sticky header inside a scroller', (r) => r.panel)

console.log('\n### 3. A layer glued to a scroller’s scrollport\n')
console.log(`| offset | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
results[0].glue.rows.forEach((row, i) => {
  const cells = results.map((r) => {
    const cell = r.glue.rows[i]
    return cell.glued ? `glued · \`${cell.size}\`` : `**drifted ${cell.dx},${cell.dy}**`
  })
  console.log(`| ${row.label} | ${cells.join(' | ')} |`)
})
console.log(
  `| scrollable area | ${results
    .map((r) =>
      r.glue.grew.same
        ? `unchanged · \`${r.glue.grew.after}\``
        : `**grew to ${r.glue.grew.after}**`,
    )
    .join(' | ')} |`,
)

console.log('\n### 4. The pin predicted from one reading\n')
console.log(`| reading | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
results[0].pin.forEach((row, i) => {
  const cells = results.map((r) => {
    const cell = r.pin[i]
    return `pin at \`${cell.predicted}\` · ${cell.right ? 'riding 3px short, pinned 2px past' : '**wrong**'}`
  })
  console.log(`| ${row.label} | ${cells.join(' | ')} |`)
})

console.log('\n### 6. A padded scroller\n')
console.log(`| reading | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
results[0].padding.rows.forEach((row, i) => {
  const cells = results.map((r) => {
    const cell = r.padding.rows[i]
    const said = `${cell.rests} · \`${cell.dx}, ${cell.dy}\``
    return cell.rests === cell.want ? said : `**${said} — expected ${cell.want}**`
  })
  console.log(`| ${row.label} | ${cells.join(' | ')} |`)
})

console.log('\n### 5. `scrollIntoView({ block: "nearest" })` on a sticky target\n')
console.log(`| trip | ${results.map((r) => r.label).join(' | ')} |`)
console.log(`| --- | ${results.map(() => '---').join(' | ')} |`)
results[0].intoView.forEach((row, i) => {
  const cells = results.map((r) => {
    const cell = r.intoView[i]
    return `${cell.before} → ${cell.after} · ends ${cell.pinned ? '**pinned**' : 'riding'}`
  })
  console.log(`| ${row.label} | ${cells.join(' | ')} |`)
})
