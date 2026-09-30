/*
 * Reading the regions out of a sandbox case, for the example page that shows
 * them — CONTRIBUTING.md, **Examples on the site**.
 *
 * Text in and data out, so `regions.test.mjs` drives it directly.
 */

const OPEN = /^\s*\/\/ #region (.+)$/
const CLOSE = /^\s*\/\/ #endregion\s*$/

/** An error that names the 1-based line of the marker at fault. */
const refused = (line, message) => new Error(`line ${line}: ${message}`)

/** The lines with the indent they share taken off. A blank line has any indent. */
const dedent = (lines) => {
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => /^\s*/.exec(line)[0].length)
  const shared = indents.length === 0 ? 0 : Math.min(...indents)
  return lines.map((line) => line.slice(shared)).join('\n')
}

/**
 * Every region in `source`, in file order, as its title and its code.
 *
 * @param {string} source
 * @returns {{ title: string, code: string }[]}
 */
export function regions(source) {
  const found = []
  /** @type {{ title: string, line: number, lines: string[] } | undefined} */
  let open
  source.split('\n').forEach((text, index) => {
    const line = index + 1
    const opening = OPEN.exec(text)
    if (opening) {
      if (open)
        throw refused(line, `a region opens inside “${open.title}”, opened on line ${open.line}`)
      open = { title: opening[1].trim(), line, lines: [] }
    } else if (CLOSE.test(text)) {
      if (!open) throw refused(line, 'an #endregion closes no region')
      found.push({ title: open.title, code: dedent(open.lines) })
      open = undefined
    } else {
      open?.lines.push(text)
    }
  })
  if (open) throw refused(open.line, `the region “${open.title}” is never closed`)
  if (found.length === 0) throw new Error('no region in the file')
  return found
}
