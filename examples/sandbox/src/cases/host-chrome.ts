import { type Case, html } from '../case.js'

// What a host says once about its own chrome, and the three things it moves.
// The sandbox's footer is already named for every case — `main.ts` — and this
// one adds a support bubble of its own to the top right corner, which is the
// corner the way out prefers.
//
// Every step here is about a box of Leko's that used to land on one of the two.
// Turn the naming off in `main.ts` and watch each of them land back on it:
// that is the state annetaan/leko-archive#141 described.
export const hostChrome: Case = {
  id: 'host-chrome',
  title: 'Chrome the host says is its own',

  proves:
    "Naming a host's own chrome once keeps every box Leko draws off it: the " +
    'message takes a side with room that can actually be seen, the docked ' +
    'message sits above the footer rather than under it, and the way out ' +
    'takes a corner the support bubble does not own.',

  options: {
    // Added to the sandbox's own footer rather than replacing it, so this case
    // runs with two pieces of chrome named.
    hostChrome: '[data-support]',
  },

  mount(root, leko) {
    const support = html(`
      <button type="button" class="support-bubble" data-support>
        <span aria-hidden="true">?</span> Help
      </button>
    `)
    const page = html(`
      <div class="chrome-case">
        <div class="panel" data-settings>
          <h2>Notification settings</h2>
          <p class="hint">
            The way out is drawn in a corner no hole covers. On this page the
            corner it prefers is taken by the Help bubble, which is the
            application's, not the tour's.
          </p>
        </div>
        <p class="filler">
          Everything below the fold is here so the page has somewhere to go.
          The row the first step points at is pinned above the footer instead,
          because the whole of that step is how little screen is left under it.
        </p>
        <p class="filler">
          2.2 tightened the importer. Files that used to be skipped with a
          warning are read as far as they parse, and the warning names the
          line the reader gave up on.
        </p>
      </div>
    `)
    const row = html(`
      <div class="pinned-row" data-row>
        <span>Weekly digest</span>
        <button type="button" data-send>Send a test</button>
      </div>
    `)
    // The application's own work, reported the way an application reports it —
    // DESIGN.md, **Signals and steps**.
    row.querySelector('[data-send]')!.addEventListener('click', () => {
      leko.reached('test-started')
      window.setTimeout(() => leko.reached('test-sent'), 1600)
    })

    root.append(support, page, row)
    return () => {
      support.remove()
      page.remove()
      row.remove()
    }
  },

  stories: [
    {
      id: 'host-chrome',
      steps: [
        {
          id: 'row',
          target: { elements: '[data-row]', interactive: true },
          message:
            'There is screen under this row, and almost none of it is the ' +
            "application's to draw in: the footer console is the host's own " +
            'chrome. So the side with room is above, and the box would have ' +
            'landed in the console without it. Press "Send a test".',
          awaits: 'test-started',
        },
        {
          id: 'sending',
          message:
            'Sending… nothing is pointed at, so nothing is cut and the box ' +
            'docks at the foot instead — at the foot of what the host left, ' +
            'which is above the console rather than inside it.',
          awaits: 'test-sent',
        },
        {
          id: 'settings',
          target: '[data-settings]',
          message:
            'And the way out, up in the corner: the Help bubble is named ' +
            'chrome too, so the control that ends the tour has moved to the ' +
            'other side rather than sitting on top of it.',
        },
      ],
    },
  ],
}
