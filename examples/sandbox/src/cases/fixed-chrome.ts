import { type Case, html } from '../case.js'

// Chrome an application pins to the viewport: a bar that stays while the page
// scrolls under it. A hole cut in the document's scrim would be carried off by
// the first scroll while the bar stayed put, so a fixed target gets a layer
// that is fixed too. The second target is the trap the other way round: a
// stylesheet says `position: fixed` and a transform on an ancestor has quietly
// taken that back, so the badge scrolls with the page after all. Which of the
// two an element is, the engine is asked — never the stylesheet.
export const fixedChrome: Case = {
  id: 'fixed-chrome',
  title: 'Chrome that does not scroll',
  proves:
    'A fixed target gets a scrim that is fixed too, so its hole stays under it ' +
    'while the page scrolls — and a "fixed" element an ancestor took back into ' +
    'the flow rides the page, hole and all, because the engine is asked which it is.',

  mount(root) {
    const bar = html(`
      <div class="topbar" data-topbar>
        <button type="button" data-share>Share</button>
        <button type="button">Publish</button>
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
    root.append(bar, page)
    return () => {
      bar.remove()
      page.remove()
    }
  },

  stories: [
    {
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
      ],
    },
  ],
}
