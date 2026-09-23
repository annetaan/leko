import { describe, expect, it } from 'vitest'

import { broken, hrefs } from './links.mjs'

const BASE = '/leko'

/** A built site from `{ file: html }`, plus any files that are not pages. */
const site = (pages, others = []) => {
  const map = new Map(Object.entries(pages))
  return [map, new Set([...map.keys(), ...others])]
}

/** The findings on a site, one string each: the page, the reason and the href. */
const findings = (pages, others) =>
  broken(...site(pages, others), BASE).map(({ page, href, reason }) => `${page} ${reason} ${href}`)

const link = (href) => `<a href="${href}">x</a>`

describe('hrefs', () => {
  it('reads the href of every anchor and nothing else', () => {
    // Astro splits a long tag over lines, so an anchor whose href is on the
    // second one is the ordinary case and not a curiosity.
    const html = `<link rel="stylesheet" href="/leko/_astro/a.css">
<img src="/leko/favicon.svg">
<a class="one" href="/leko/demo/">demo</a>
<a
  class="two"
  href="/leko/lifecycle/#a-steps-lifecycle">lifecycle</a>
<abbr title="x">x</abbr>`
    expect(hrefs(html)).toEqual(['/leko/demo/', '/leko/lifecycle/#a-steps-lifecycle'])
  })

  it('reads an href as a browser does, with the escaping taken off', () => {
    expect(hrefs('<a href="/leko/?a=1&amp;b=2">x</a>')).toEqual(['/leko/?a=1&b=2'])
  })

  it('does not read a code sample that shows a link as a link', () => {
    // What a fenced block showing `<a href="/demo/">` comes out as.
    const html =
      '<pre><code><span>&lt;a href=&quot;/demo/&quot;&gt;</span></code></pre>' +
      '<code>&lt;LinkButton href=&quot;/demo/&quot;&gt;</code>'
    expect(hrefs(html)).toEqual([])
  })
})

describe('broken', () => {
  it('lands a link with the base on that page', () => {
    expect(findings({ 'index.html': link('/leko/demo/'), 'demo/index.html': '' })).toEqual([])
  })

  it('lands the base itself on the front page', () => {
    const page = { 'demo/index.html': link('/leko/') + link('/leko'), 'index.html': '' }
    expect(findings(page)).toEqual([])
  })

  it('lands a link without the trailing slash where Pages redirects it', () => {
    expect(findings({ 'index.html': link('/leko/demo'), 'demo/index.html': '' })).toEqual([])
  })

  it('reports a link to a page that is not there', () => {
    expect(findings({ 'index.html': link('/leko/demo/') })).toEqual([
      'index.html no page /leko/demo/',
    ])
  })

  it('takes a link written without the base for broken, not external', () => {
    // The one `docs/src/lib/href.ts` exists to prevent.
    const pages = { 'index.html': link('/demo/'), 'demo/index.html': '' }
    expect(findings(pages)).toEqual(['index.html outside base /demo/'])
  })

  it('does not take a path that only begins with the base for the base', () => {
    const pages = { 'index.html': link('/lekodemo/'), 'lekodemo/index.html': '' }
    expect(findings(pages)).toEqual(['index.html outside base /lekodemo/'])
  })

  it('wants a fragment to be an id on the page it lands on', () => {
    const pages = {
      'index.html': link('/leko/demo/#there') + link('/leko/demo/#nowhere'),
      'demo/index.html': '<h2 id="there">There</h2>',
    }
    expect(findings(pages)).toEqual(['index.html no fragment /leko/demo/#nowhere'])
  })

  it('checks a fragment on the same page against the page it is on', () => {
    // Starlight's own "back to top" link, `#_top`, is one of these, and lands
    // because the page carries the id like any other.
    const pages = {
      'index.html': link('#_top') + link('#nowhere') + '<html id="_top">',
      'demo/index.html': link('#nowhere') + '<h2 id="nowhere">',
    }
    expect(findings(pages)).toEqual(['index.html no fragment #nowhere'])
  })

  it('matches a fragment the URL parser percent-encodes against the id as the page spells it', () => {
    // `new URL('#café', …).hash` is `#caf%C3%A9`, and the id is `café`.
    const pages = { 'index.html': link('#café') + link('#a b') + '<h2 id="café"><h2 id="a b">' }
    expect(findings(pages)).toEqual([])
  })

  it('lands a percent-encoded path on the file the disk names in plain characters', () => {
    const pages = {
      'index.html': link('/leko/caf%C3%A9/') + link('/leko/café/'),
      'café/index.html': '',
    }
    expect(findings(pages)).toEqual([])
  })

  it('resolves a relative link from the page it is written on', () => {
    // `../lifecycle/` lands from `/leko/demo/` and nowhere from `/leko/`, and
    // enough `../` climbs out of the base altogether.
    const pages = {
      'demo/index.html': link('../lifecycle/') + link('../../lifecycle/'),
      'index.html': link('../lifecycle/'),
      'lifecycle/index.html': '',
    }
    expect(findings(pages)).toEqual([
      'demo/index.html outside base ../../lifecycle/',
      'index.html outside base ../lifecycle/',
    ])
  })

  it('lands a link on a file that is there, such as the favicon', () => {
    const pages = { 'index.html': link('/leko/favicon.svg') + link('/leko/missing.svg') }
    expect(findings(pages, ['favicon.svg'])).toEqual(['index.html no page /leko/missing.svg'])
  })

  it('checks no fragment on a file that is not a page', () => {
    expect(findings({ 'index.html': link('/leko/a.pdf#page=2') }, ['a.pdf'])).toEqual([])
  })

  it('leaves external, mailto and tel links alone', () => {
    const page = [
      'https://github.com/annetaan/leko',
      'http://example.com/demo/',
      '//example.com/demo/',
      'mailto:someone@example.com',
      'tel:+81000000000',
    ]
      .map(link)
      .join('')
    expect(findings({ 'index.html': page })).toEqual([])
  })
})
