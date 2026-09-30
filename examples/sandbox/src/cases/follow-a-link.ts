import { type Case, html } from '../case.js'
import type { LekoStory } from '@annetaan/leko'

// This case's own id, because the sandbox picks which case is showing from
// the first segment of `location.hash` (`main.ts`'s `route`), and this case
// owns everything after it as a hash of its own — `#follow-a-link/checkout`
// — the way the hash story's target below is written.
const CASE_ID = 'follow-a-link'

// #region The story
// A query rather than a path, so a reload at the checkout URL is still this
// page on a host that serves one file per path, as the site does. Both look
// only before the `#`, which is this case's own and never holds `view`.
const VIEW_CHECKOUT = /^[^#]*[?&]view=checkout(?:[&#]|$)/
const VIEW_HOME = /^(?![^#]*[?&]view=checkout(?:[&#]|$))/

// Home is "not at the checkout hash", because a host that does not route by
// hash shows this case with no hash at all.
const HASH_CHECKOUT = new RegExp(`#${CASE_ID}/checkout(?:[/?]|$)`)
const HASH_HOME = new RegExp(`^(?!.*#${CASE_ID}/checkout(?:[/?]|$))`)

const queryRouter = {
  id: 'query-router',
  steps: [
    {
      id: 'go-to-checkout',
      target: { elements: '[data-route-link]', interactive: true },
      message:
        'Press this. The router pushes a URL with ?view=checkout in it, and that is what this step is waiting for.',
      awaits: { url: VIEW_CHECKOUT },
    },
    {
      id: 'arrived-by-query',
      target: '[data-confirm]',
      message: 'The URL with ?view=checkout in it moved this step, not the click.',
    },
    {
      id: 'go-back',
      target: { elements: '[data-back]', interactive: true },
      message:
        'Press Back. Leaving ?view=checkout is a URL change too, and a step can wait for that one just the same.',
      awaits: { url: VIEW_HOME },
    },
    {
      id: 'arrived-by-back',
      target: '[data-current-path]',
      message: 'history.back() moved this step. Nothing here told the tour a button was pressed.',
    },
  ],
} satisfies LekoStory

const hashRouter = {
  id: 'hash-router',
  steps: [
    {
      id: 'go-to-checkout-hash',
      target: { elements: '[data-hash-link]', interactive: true },
      message:
        'Press this plain link. There is no click handler on it — the browser changes the hash by itself.',
      awaits: { url: HASH_CHECKOUT },
    },
    {
      id: 'arrived-by-hash',
      target: '[data-confirm]',
      message: 'The hash ending in /checkout moved this step. No router was needed to write it.',
    },
    {
      id: 'go-back-hash',
      target: { elements: '[data-back]', interactive: true },
      message:
        'Press Back. It leaves the /checkout hash the same way traversal does anywhere else.',
      awaits: { url: HASH_HOME },
    },
    {
      id: 'arrived-by-back-hash',
      target: '[data-confirm]',
      message: 'Traversal moved this step too — forward or back, only the URL matters.',
    },
  ],
} satisfies LekoStory
// #endregion

const where = (): string => location.pathname + location.search + location.hash

export const followALink: Case = {
  id: CASE_ID,
  title: 'A step that waits for a URL',
  proves:
    'Neither link below has a handler written for the tour, and this case ' +
    'calls reached() nowhere at all. One story follows a link a small router ' +
    'intercepts with pushState; the other follows a plain anchor the browser ' +
    'handles on its own. Both steps advance because the URL came to match ' +
    'their pattern — DESIGN.md, "A URL is a signal the page reports."',

  mount(root) {
    const page = html(`
      <div class="panel">
        <h2>Storefront</h2>
        <p class="hint" data-current-path>Currently at: ${where()}</p>
        <p class="hint">
          The first link below is intercepted by a few lines of pushState and
          popstate that belong to this case's own little router — not to the
          tour. The second is a plain anchor with no listener on it at all;
          the hash change it makes is the browser's own doing.
        </p>
        <a href="?view=checkout" data-route-link>Go to checkout</a>
        <a href="#${CASE_ID}/checkout" data-hash-link>Go to checkout (hash)</a>
        <button type="button" data-confirm>Confirm order</button>
        <button type="button" data-back>Back</button>
      </div>
    `)

    const pathReadout = page.querySelector<HTMLElement>('[data-current-path]')!
    const routeLink = page.querySelector<HTMLAnchorElement>('[data-route-link]')!
    const backButton = page.querySelector<HTMLButtonElement>('[data-back]')!

    const render = (): void => {
      pathReadout.textContent = `Currently at: ${where()}`
    }

    // #region The page's own router
    const goToCheckout = (event: MouseEvent): void => {
      event.preventDefault()
      const url = new URL(location.href)
      url.searchParams.set('view', 'checkout')
      history.pushState(null, '', url)
      render()
    }

    routeLink.addEventListener('click', goToCheckout)
    backButton.addEventListener('click', () => history.back())
    // #endregion
    window.addEventListener('popstate', render)
    // A plain fragment link fires no `popstate` — only `hashchange` — so the
    // readout needs both to stay in step with the hash story's own link.
    window.addEventListener('hashchange', render)

    root.append(page)
    return () => {
      window.removeEventListener('popstate', render)
      window.removeEventListener('hashchange', render)
      // Only `view` is this case's own to clean up. The hash is not: by the
      // time a case is torn down for another one, `main.ts`'s own hashchange
      // handler has already moved it to the case being shown next, and
      // overwriting it here would send that navigation back to this one.
      const search = new URLSearchParams(location.search)
      if (search.has('view')) {
        search.delete('view')
        const query = search.toString()
        history.replaceState(
          null,
          '',
          location.pathname + (query ? `?${query}` : '') + location.hash,
        )
      }
      page.remove()
    }
  },

  stories: [queryRouter, hashRouter],
}
