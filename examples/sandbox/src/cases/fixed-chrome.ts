import type { LekoStory } from '@annetaan/leko'

import { type Case, html } from '../case.js'

// Chrome an application pins to the viewport: a bar that stays while the page
// scrolls under it — DESIGN.md, **A `position: fixed` target is carried by the
// viewport, so its layer is too**. The badge is the trap the other way round: a
// stylesheet says `position: fixed` and a transform on an ancestor has quietly
// taken that back, so the badge scrolls with the page after all. Which of the
// two an element is, the engine is asked — never the stylesheet.
//
// The last step is about the layer's edge rather than its holes. Locking the
// page's scroll is what an application does when it opens a modal, and on a
// platform with classic scrollbars it takes the document scrollbar away —
// DESIGN.md, **That layer is sized past the layout viewport on purpose, gutter
// included**. The strip at the right edge is there to be clicked at: it is
// application chrome the step did not open, so a click must never reach it,
// before the lock or after it.

// #region The story
const story = {
  id: 'fixed-chrome',
  steps: [
    {
      id: 'bar',
      target: '[data-share]',
      message:
        'Scroll the page. The bar stays where it is, and so does the hole: ' +
        'a fixed target gets a scrim that is fixed too, and nothing runs ' +
        'while you scroll.',
    },
    {
      id: 'badge',
      target: '[data-badge]',
      message:
        'This badge says position: fixed too, and the transform on its ' +
        'card took that away — it rides the page now. Scroll: the hole ' +
        'rides with it. The engine is asked which of the two an element ' +
        'is, not the stylesheet.',
    },
    {
      id: 'gutter',
      // Open, because the point of the step is what happens when it is
      // pressed. The strip at the right edge is not, and that is the
      // difference the step is about.
      target: { elements: '[data-lock]', interactive: true },
      message:
        'Press this. The page stops scrolling, the way it would under a ' +
        'modal, and where the scrollbars are the kind that take space its ' +
        'scrollbar goes with it — no resize event fires for that. Try ' +
        'clicking the strip at the right edge, where the scrollbar was: ' +
        'the layer is sized past the layout viewport, so it still covers ' +
        'the gutter and the click lands on nothing.',
    },
  ],
} satisfies LekoStory
// #endregion

export const fixedChrome: Case = {
  id: 'fixed-chrome',
  title: 'Chrome that does not scroll',
  proves:
    'A fixed target gets a scrim that is fixed too, so its hole stays under it ' +
    'while the page scrolls — and a "fixed" element an ancestor took back into ' +
    'the flow rides the page, hole and all, because the engine is asked which ' +
    'it is. The page losing its scrollbar mid-step leaves the layer still ' +
    'covering the gutter it was in, with nothing to tell the layer that ' +
    'happened.',

  mount(root) {
    const bar = html(`
      <div class="topbar" data-topbar>
        <button type="button" data-share>Share</button>
        <button type="button">Publish</button>
        <button type="button" data-lock>Lock page scroll</button>
      </div>
    `)
    const page = html(`
      <div class="tall-page">
        <div class="panel">
          <h2>A bar the page scrolls under</h2>
          <p class="hint">
            The actions at the top right are <code>position: fixed</code>.
            Start the tour and scroll: they stay, and so must the hole.
          </p>
          <p class="hint" data-probe-log>
            Nothing has reached the strip down the right-hand edge.
          </p>
        </div>
        <div class="panel lifted" data-card>
          <span class="badge" data-badge>Draft</span>
          <h2>A card with a transform on it</h2>
          <p class="hint">
            The badge in this card's corner is <code>position: fixed</code> in
            the stylesheet as well, and the transform on the card has taken
            that away: it is pinned to the card, not the viewport, and scrolls
            with the page like everything else here.
          </p>
        </div>
        <p class="filler">
          The rest of the page is here to be scrolled. Notes from three
          releases follow, none of them pointed at, so there is room to move
          under both targets and watch what each hole does.
        </p>
        <p class="filler">
          2.2 tightened the importer. Files that used to be skipped with a
          warning are read as far as they parse, and the warning names the
          line the reader gave up on rather than the file it gave up in.
        </p>
        <p class="filler">
          2.1 was the quiet one. No new surface, four hundred fewer lines,
          and the undo history survives a reload for the first time.
        </p>
        <p class="filler">
          2.0 is the one everything else builds on. Panels became rails, the
          inspector stopped floating, and the export pipeline was rewritten.
        </p>
        <div class="scroll-room"></div>
      </div>
    `)
    // The strip the scrollbar's gutter is behind, and the one place on this page
    // a click is counted. Fixed at the right edge so it is under the fixed
    // layer, and never a target, so nothing ever opens it.
    const probe = html(`
      <button type="button" class="edge-probe" data-edge-probe>
        <span>click me</span>
      </button>
    `)
    const log = page.querySelector('[data-probe-log]')!
    probe.addEventListener('click', () => {
      probe.classList.add('reached')
      log.textContent = 'A click reached the strip at the right edge — the layer left a gap there.'
    })
    // #region The page's own scroll lock
    // A scroll lock, the way an application does one for a modal — and what
    // takes the document scrollbar away. Application behaviour, and it says
    // nothing about a tour: the step that opens this button is the story's
    // business, not the button's.
    const lock = bar.querySelector('[data-lock]')!
    lock.addEventListener('click', () => {
      const locked = document.documentElement.style.overflow === 'hidden'
      document.documentElement.style.overflow = locked ? '' : 'hidden'
      lock.textContent = locked ? 'Lock page scroll' : 'Unlock page scroll'
    })
    // #endregion
    root.append(bar, page, probe)
    return () => {
      document.documentElement.style.overflow = ''
      bar.remove()
      page.remove()
      probe.remove()
    }
  },

  stories: [story],
}
