/**
 * A site-root path with the deploy base on the front of it.
 *
 * The site is served from `/leko` on GitHub Pages and from `/` nowhere yet, and
 * Starlight's own components do not put the base on an `href` you hand them —
 * `<LinkButton href="/demo/">` emits `/demo/` and breaks the moment the base is
 * not empty. Sidebar entries built from a `slug` are fine, because Starlight
 * builds those itself. Everything a page writes by hand comes through here.
 *
 * A relative link works too and needs nothing, but it is only correct from the
 * depth it was written at, so moving a page silently breaks it.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '')

export const href = (path: string): string => `${BASE}/${path.replace(/^\/+/, '')}`
