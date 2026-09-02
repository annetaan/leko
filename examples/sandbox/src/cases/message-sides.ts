import { at, html, type Case } from '../case.js'

// Which side of the cutout the message takes, and where it goes when there is
// no cutout to take a side of. The side is picked once per step, from how much
// of the viewport is left around the hole, in the order bottom, top, right,
// left — so each target here leaves room on exactly one of them. Everything
// after the pick is the browser's: scrolling moves the box with its anchor,
// and no script runs while it does.
export const messageSides: Case = {
  id: 'message-sides',
  title: 'Which side the message takes',

  proves:
    'The message takes the first side with room — below, above, right, left ' +
    '— measured once when the step is drawn, and docks at the foot of the ' +
    'viewport when there is no hole to sit beside.',

  mount(root, leko) {
    // The rails are fixed, which is what pins the choice to the viewport's own
    // edges. It also means a hole cut over one is right where the document
    // stood when the step was drawn: scroll after that and the hole rides the
    // document while the rail stays put. That drift is a real gap, left
    // visible on purpose — a page must never be reshaped to spare the tour,
    // and #133 is the layer the library is missing.
    const tools = html(`
      <div class="chrome chrome-left" data-tools aria-hidden="true">
        <span>✚</span><span>✎</span><span>▦</span><span>✂</span><span>⧉</span>
      </div>
    `)
    const inspector = html(`
      <div class="chrome chrome-right" data-inspector>
        <h3>Inspector</h3>
        <div class="chrome-field">Document<output>Release notes</output></div>
        <div class="chrome-field">Sections<output>7</output></div>
        <div class="chrome-field">Export<output data-status>Not exported.</output></div>
      </div>
    `)
    const flow = html(`
      <div class="between-rails">
        <div class="panel" data-intro>
          <h2>Release notes</h2>
          <p class="hint">
            A document between two rails. The tour visits each edge of the
            viewport, and the message finds the side with room every time.
          </p>
        </div>
        <div class="scroll-room">
          <p class="filler">
            The notes below run past the fold on purpose: the second step
            points at a card you have to scroll to, because a target below the
            screen is what makes the box go above.
          </p>
          <p class="filler">
            2.2 tightened the importer. Files that used to be skipped with a
            warning are read as far as they parse, and the warning names the
            line the reader gave up on rather than the file it gave up in.
          </p>
          <p class="filler">
            2.1 was the quiet one. No new surface, four hundred fewer lines,
            and the undo history survives a reload for the first time. Nobody
            wrote in about it, which was the point.
          </p>
        </div>
        <div class="milestone" data-milestone>
          <h3>2.0 — the redesign</h3>
          <p class="hint">
            The one everything else here builds on. Panels became rails, the
            inspector stopped floating, and the export pipeline was rewritten.
          </p>
        </div>
        <p class="filler">
          1.4 and earlier are kept for the record rather than for reading. The
          format they describe is still importable, and the importer above is
          why.
        </p>
        <p class="filler">
          1.0 shipped with two panels and no inspector at all. The document
          format is the only part of it that survives unchanged.
        </p>
      </div>
    `)

    // The application's own export, written where the application would write
    // it: it reports that the render finished, and knows nothing about steps.
    renderExport = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2800))
      at('[data-status]').textContent = 'PDF ready.'
      leko.reached('export-finished')
    }

    root.append(tools, inspector, flow)
    return () => {
      tools.remove()
      inspector.remove()
      flow.remove()
    }
  },

  stories: [
    {
      id: 'message-sides',
      steps: [
        {
          id: 'below',
          target: '[data-intro]',
          message:
            'Below first: under the thing it describes is the least ' +
            'surprising place for a message, so this side is tried before ' +
            'any other.',
        },
        {
          id: 'above',
          target: '[data-milestone]',
          message:
            'This card was below the fold when the step was drawn, so there ' +
            'was no screen under it and the box went above — picked once, ' +
            'from where the card was. Scroll down to meet it: the box rides ' +
            'with the card the whole way, and no script runs while it does.',
        },
        {
          id: 'beside-right',
          target: '[data-tools]',
          message:
            'Above and below this rail there is almost no viewport at all, ' +
            'so the box takes the first side that has room: the right.',
        },
        {
          id: 'beside-left',
          target: '[data-inspector]',
          message:
            'The same choice from the other edge. The right side is off the ' +
            'screen this time, and left is the last side tried before the ' +
            'box gives up on sides altogether.',
        },
        {
          // A step that points at nothing cuts nothing, so there is no hole
          // for the box to sit beside and no anchor to hang it on. Docking at
          // the foot of the viewport is that case — and the same place the box
          // goes in a browser that cannot track an anchor at all.
          id: 'docked',
          message:
            'Rendering the PDF… Nothing is pointed at, so nothing is cut, ' +
            'and a box with no hole to sit beside docks at the foot of the ' +
            'viewport instead. It stays there rather than pretending to have ' +
            'an anchor it would drift away from.',
          awaits: 'export-finished',
          onEnter: () => {
            void renderExport()
          },
        },
        {
          id: 'exported',
          target: '[data-status]',
          message:
            'And back where it started: the export landed near the top of ' +
            'the inspector, there is room under it again, and the first side ' +
            'tried is the one that wins.',
        },
      ],
    },
  ],
}

/** Set by {@link messageSides.mount}, which is where the instance to report to is. */
let renderExport: () => Promise<void> = async () => {}
