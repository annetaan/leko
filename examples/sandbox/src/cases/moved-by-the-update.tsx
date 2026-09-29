import { type Leko } from '@annetaan/leko'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { Case } from '../case.js'

// Two handlers that change the page and report it in the same breath, the way
// an application written in React does. The density toggle sets state and
// calls reached() on the next line, so React renders the taller rows in a
// microtask after the handler returns. The save awaits its request, then sets
// state and reports, so that render lands in a task of its own. Each update
// moves the next step's target, and the saved notice moves the summary too.
//
// Watch steps 2 and 3, at ×1 and under prefers-reduced-motion: the hole
// should sit on the Save button once the rows have grown, and on the summary
// once the notice has pushed it down.
//
// An application exports its instance from a module; this case is handed it
// through `mount`, because the sandbox makes one instance per case each time
// the case is shown.

type Density = 'compact' | 'roomy'

const ROWS = ['Inbox', 'Drafts', 'Sent', 'Archive', 'Spam']

function Page({ leko }: { leko: Leko }) {
  const [density, setDensity] = useState<Density>('compact')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const next: Density = density === 'compact' ? 'roomy' : 'compact'
  const padding = density === 'compact' ? 4 : 20
  return (
    <div className="panel">
      <h2>Layout</h2>
      <p className="hint">
        Density and the saved state are React state. Each handler updates it and reports in the same
        call.
      </p>
      <button
        type="button"
        data-density-toggle
        onClick={() => {
          setDensity(next)
          leko.reached('density-changed')
        }}
      >
        Density: {density}
      </button>
      {saved && (
        <p className="hint" data-saved-notice style={{ padding: '24px 0' }}>
          Layout saved. This notice arrived with the save, above the list.
        </p>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {ROWS.map((row) => (
          <li key={row} style={{ padding: `${padding}px 0`, borderBottom: '1px solid #ddd' }}>
            {row}
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-save-layout
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          await new Promise((resolve) => setTimeout(resolve, 600))
          setSaved(true)
          leko.reached('layout-saved')
        }}
      >
        {saved ? 'Saved' : saving ? 'Saving…' : 'Save layout'}
      </button>
      <p className="hint" data-layout-summary>
        {density === 'compact' ? 'Compact rows.' : 'Roomy rows.'}
        {saved ? ' Saved, and kept for the next visit.' : ' Not saved yet.'}
      </p>
    </div>
  )
}

export const movedByTheUpdate: Case = {
  id: 'moved-by-the-update',
  title: 'A target moved by the update its signal reports',

  proves:
    'A step after reached() is cut around its target where the update the same ' +
    'handler made put it, whether the framework renders that update in a ' +
    'microtask or in a task of its own.',

  mount(root, leko) {
    const container = document.createElement('div')
    root.append(container)
    const app = createRoot(container)
    app.render(
      <StrictMode>
        <Page leko={leko} />
      </StrictMode>,
    )
    return () => {
      app.unmount()
      container.remove()
    }
  },

  stories: [
    {
      id: 'moved-by-the-update',
      steps: [
        {
          id: 'density',
          target: { elements: '[data-density-toggle]', interactive: true },
          message:
            'Switch the density. The rows grow in the render after the click, ' +
            'and the Save button below them moves down.',
          awaits: 'density-changed',
        },
        {
          id: 'save',
          target: { elements: '[data-save-layout]', interactive: true },
          message:
            'The hole should sit on the Save button where the taller rows put it. ' +
            'Save, and watch the summary move when the notice appears.',
          awaits: 'layout-saved',
        },
        {
          id: 'summary',
          target: '[data-layout-summary]',
          message:
            'The hole should sit on the summary below the Save button, pushed down ' +
            'by the notice the save added above the list.',
        },
      ],
    },
  ],
}
