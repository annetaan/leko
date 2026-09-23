import { type Case, html } from '../case.js'
import type { LekoStep, LekoStory } from '@annetaan/leko'

// This case's own id, and the hash it is shown under — `main.ts`'s `route`
// reads the first segment of `location.hash` to pick a case. Unlike
// `follow-a-link.ts` this case owns no segment after it, so the hash is
// exactly this when the case is showing.
const CASE_ID = 'across-a-page-load'

// The storefront's last step waits for this, and only a real navigation
// makes it true: a plain `<a href>` with the query string changed is a
// cross-document load in every engine, so nothing here is a hash trick.
const CHECKOUT_URL = /[?&]page=checkout(?:[&#]|$)/

const storefront: LekoStory = {
  id: 'storefront',
  next: () => checkout,
  steps: [
    {
      id: 'look',
      target: '[data-storefront-heading]',
      message: 'Two documents. Nothing on this page will be on the next one.',
    },
    {
      id: 'go',
      target: { elements: '[data-checkout-link]', interactive: true },
      message:
        'Press this. The page it lands on is a new document — this story’s ' +
        '‘next’ is what that document runs.',
      awaits: { url: CHECKOUT_URL },
    },
  ],
}

const checkout: LekoStory = {
  id: 'checkout',
  steps: [
    {
      id: 'summary',
      target: '[data-summary]',
      message:
        'The successor starts here, at its first step. Nothing crosses ' +
        'with it but its id — no index, no visual continuity with what ' +
        'ran before it. The readout above says which of this page’s ' +
        'two ways in actually ran it.',
    },
    {
      id: 'back',
      target: { elements: '[data-back-link]', interactive: true },
      message:
        'Nothing is handed on from here — this step waits for no URL — ' +
        'so the storefront loads with no tour on it, and a reload of this ' +
        'page starts nothing either.',
    },
  ],
}

export const acrossAPageLoad: Case = {
  id: CASE_ID,
  title: 'A tour that crosses a page load',
  proves:
    'The link is a plain anchor and the page it lands on is a new document. ' +
    'The storefront’s last step waits for that URL and names ‘next’; ' +
    'at pagehide Leko keeps the successor’s id, and the new document’s ' +
    'one pickUp() call starts it from its first step, irising in like any ' +
    'step 1 — DESIGN.md, “A page load ends the story, and hands it on.”',

  // What this case cannot show:
  // - A back/forward-cache restore. Pressing Back from the checkout page may
  //   or may not restore the storefront document; the spike never observed a
  //   restore in any engine and neither did this sandbox. Whatever Back does
  //   here is the browser's, and `forget()` is held up by `wiring.test.ts`,
  //   not by anything visible here.
  // - The `from` silence on its own. A reload from the storefront's last step
  //   lands on a URL the note was kept at *and* one the pattern does not
  //   match, so this page cannot tell the two reasons apart; the wiring test
  //   that lands on the kept URL with a matching pattern is what isolates it.
  // - A page with no Leko between the two. Every load of the sandbox runs
  //   pickUp, so the note never outlives one navigation here.
  // - Storage that throws, and real Safari.

  mount(root) {
    const page = new URLSearchParams(location.search).get('page')

    // `[data-arrived]`'s inline `min-height: 2lh` holds its box to two
    // lines before `onStep` ever writes to it. The `summary` step's hole is
    // measured and drawn on `stepEntered`; `onStep` — which swaps this
    // paragraph's one-line default for a two-line sentence — only runs on
    // the following `drawn`. Sitting above the target, a box here that grew
    // would push `[data-summary]` down after its hole was already
    // measured, and nothing afterwards re-reads layout to correct it, so
    // the hole would stay wrong for the whole step. A paragraph above a
    // target must not change height.
    const panel =
      page === 'checkout'
        ? html(`
            <div class="panel">
              <h2>Checkout</h2>
              <p class="hint" data-arrived style="min-height: 2lh">
                Nothing to report yet — this fills in when “checkout” begins.
              </p>
              <p class="hint">Order summary</p>
              <ul data-summary>
                <li>Enclosure, 2U × 4</li>
                <li>Rail kit × 4</li>
              </ul>
              <a href="./#${CASE_ID}" data-back-link>Back to the storefront</a>
            </div>
          `)
        : html(`
            <div class="panel">
              <h2 data-storefront-heading>Storefront</h2>
              <p class="hint">
                The link below is a plain anchor with no listener on it. Pressing
                it is a real page load, and it lands on a new document —
                nothing on this page will still be running. A reload keeps a
                note only when the tour is waiting on this very link, because
                that is the story's last step — and even then, the document it
                lands on is the one the note was kept at, so pickUp() takes
                the note and starts nothing.
              </p>
              <a href="?page=checkout#${CASE_ID}" data-checkout-link>Go to checkout</a>
            </div>
          `)

    root.append(panel)

    return () => {
      // Strip `page` for a real case switch only, never for a same-case
      // re-show: `main.ts`'s `speedPick` handler re-runs this teardown on a
      // pace change while this case stays on screen, and rewriting the URL
      // there would silently drop a reader on the checkout panel back to the
      // storefront. By teardown time `main.ts`'s own hashchange handler has
      // already moved the hash to the case being shown next — `follow-a-
      // link.ts` gives the same reason for leaving the hash itself alone —
      // so that is what tells the two apart.
      if (page !== null && location.hash !== `#${CASE_ID}`) {
        const search = new URLSearchParams(location.search)
        search.delete('page')
        const query = search.toString()
        history.replaceState(
          null,
          '',
          location.pathname + (query ? `?${query}` : '') + location.hash,
        )
      }
    }
  },

  stories: [storefront, checkout],

  onStep: (root) => (step: LekoStep | undefined, story: LekoStory) => {
    if (story.id !== 'checkout' || step?.id !== 'summary') return
    const readout = root.querySelector<HTMLElement>('[data-arrived]')
    if (!readout) return
    // `index.html` loads `main.ts` as `<script type="module">`, which runs
    // deferred: pickUp() runs before the `load` event, while
    // `document.readyState` is still `'interactive'`. A press of the
    // footer's start('checkout') necessarily comes after `load`, once
    // `readyState` is `'complete'` — a fact, not a guess from a number that
    // depends on the machine and the network.
    const ms = Math.round(performance.now())
    readout.textContent =
      document.readyState === 'complete'
        ? `“checkout” began ${ms}ms after this document’s navigation ` +
          'started, after it had already finished loading — a press of ' +
          'start(‘checkout’) in the footer began it.'
        : `“checkout” began ${ms}ms after this document’s navigation ` +
          'started, before it had finished loading — pickUp() began it.'
  },
}
