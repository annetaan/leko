/*
 * Finding the links in a built page, and whether each one lands.
 *
 * Text in and findings out, so `links.test.mjs` drives it directly and
 * `check-links.mjs` is left with the disk and the report.
 */

/**
 * The `href` of an `<a>` and of nothing else. `[^>]` crosses a newline, which
 * matters because Astro splits a long tag over lines. `<link>`, `<abbr>` and
 * `<area>` fail on the `\s` after the `a`.
 *
 * A link shown in a code sample is not one of these: it reaches the built page
 * escaped, as `&lt;a href=&quot;`, so there is no `<a` to match.
 */
const ANCHOR = /<a\s[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

/** `\s` in front, so a `data-id` is not an `id`. */
const ID = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

const ENTITIES = { amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' }

/** What an attribute value says once the escaping HTML put on it is taken off. */
const unescaped = (value) => value.replace(/&(amp|quot|#39|lt|gt);/g, (_, name) => ENTITIES[name])

/** A path or fragment as the disk and an `id` spell it, or as written where it will not decode. */
const decoded = (text) => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** Every `href` of an `<a>` in a page, as a browser would read it. */
export function hrefs(html) {
  return Array.from(html.matchAll(ANCHOR), ([, double, single]) => unescaped(double ?? single))
}

/** Every `id` in a page: the fragments a link into it may name. */
export function anchors(html) {
  return new Set(Array.from(html.matchAll(ID), ([, double, single]) => unescaped(double ?? single)))
}

/** Stands in for the host the site is served from, so a URL can do the resolving. */
const ORIGIN = 'http://leko.invalid'

/**
 * Where one link goes, from a page whose site path is `page`, such as
 * `/leko/demo/`.
 *
 * `null` for a link somewhere else — any scheme, `mailto:` and `tel:`
 * included, or another host. A link on this site comes back as the path under
 * `base`, with no slash in front, and the fragment it wants, if any.
 *
 * A link from the root that does not start with `base` is broken rather than
 * external: the link `docs/src/lib/href.ts` exists to prevent.
 */
export function resolve(href, page, base) {
  const url = new URL(href, ORIGIN + page)
  if (url.origin !== ORIGIN) return null
  const fragment = decoded(url.hash.slice(1))
  const path = decoded(url.pathname)
  if (path !== base && !path.startsWith(`${base}/`)) return { broken: 'outside base' }
  return { path: path.slice(base.length + 1), fragment }
}

/**
 * The file in the built site a path under the base is served from, or
 * `undefined`. A directory is its `index.html`, with or without the trailing
 * slash, because Pages redirects `/leko/demo` to `/leko/demo/`. A path that is
 * not a directory has to be a file itself: the favicon, a stylesheet.
 */
export function lands(path, files) {
  const bare = path.replace(/\/$/, '')
  const index = bare === '' ? 'index.html' : `${bare}/index.html`
  if (files.has(index)) return index
  if (!path.endsWith('/') && files.has(path)) return path
  return undefined
}

/** The site path a page in the built site is served at. */
const served = (file, base) => `${base}/${file.replace(/(^|\/)index\.html$/, '$1')}`

/**
 * Every link in the built site that goes somewhere on it: the page it is on,
 * the `href` as written, and where it resolved to. `pages` maps each HTML file
 * in the build, by its path inside it, to what it holds.
 */
export function* internal(pages, base) {
  for (const [page, html] of pages) {
    for (const href of hrefs(html)) {
      const link = resolve(href, served(page, base), base)
      if (link !== null) yield { page, href, link }
    }
  }
}

/**
 * The internal links that do not land, each with why: `outside base`,
 * `no page`, or `no fragment`. `files` is every path in the build. A fragment
 * is checked only where the link lands on a page, against the `id`s that page
 * carries.
 */
export function broken(pages, files, base) {
  const ids = new Map()
  const carried = (file) => {
    if (!ids.has(file)) ids.set(file, anchors(pages.get(file)))
    return ids.get(file)
  }

  const found = []
  for (const { page, href, link } of internal(pages, base)) {
    if (link.broken) {
      found.push({ page, href, reason: link.broken })
      continue
    }
    const file = lands(link.path, files)
    if (file === undefined) found.push({ page, href, reason: 'no page' })
    else if (link.fragment && pages.has(file) && !carried(file).has(link.fragment)) {
      found.push({ page, href, reason: 'no fragment' })
    }
  }
  return found
}
