import { type Leko } from '@annetaan/leko'
import {
  createContext,
  type ReactNode,
  StrictMode,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'

import type { Case } from '../case.js'

// The way out drawn by the application's own React tree. `renderClose` hands
// the root Leko positions to a store, and a component inside the app's
// providers portals its button into it — so the control reads the palette the
// rest of the page reads, which a second `createRoot` in `renderClose` could
// not. Switch the palette and the corner repaints with the page.
//
// Also a placement check: the button arrives after `renderClose` has returned,
// so watch that the control sits wholly inside the viewport on the first step,
// at ×1 and under prefers-reduced-motion.
//
// An application exports its instance from a module; this case is handed it
// through `mount`, because the sandbox makes one instance per case each time
// the case is shown.

type CloseSlot = { root: HTMLElement; stop: () => void }
let held: CloseSlot | null = null
const listeners = new Set<() => void>()
const fill = (next: CloseSlot | null) => {
  held = next
  for (const l of listeners) l()
}
export const closeSlot = {
  subscribe: (l: () => void) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
  current: () => held,
}

type PaletteName = 'ocean' | 'ember'
type Palette = { name: PaletteName; background: string; ink: string; label: string }

const PALETTES: Record<PaletteName, Palette> = {
  ocean: { name: 'ocean', background: '#0b5cad', ink: '#ffffff', label: 'Leave the tour' },
  ember: { name: 'ember', background: '#b8430f', ink: '#fff7ed', label: 'Done for now' },
}

const PaletteContext = createContext<{ palette: Palette; toggle: () => void } | null>(null)

function usePalette() {
  const value = useContext(PaletteContext)
  if (!value) throw new Error('usePalette outside PaletteProvider')
  return value
}

function PaletteProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<PaletteName>('ocean')
  const toggle = () => setName((now) => (now === 'ocean' ? 'ember' : 'ocean'))
  return (
    <PaletteContext.Provider value={{ palette: PALETTES[name], toggle }}>
      {children}
    </PaletteContext.Provider>
  )
}

function Page({ leko }: { leko: Leko }) {
  const { palette, toggle } = usePalette()
  return (
    <div
      className="panel palette-panel"
      data-palette-panel
      style={{ borderColor: palette.background }}
    >
      <h2>Appearance</h2>
      <p className="hint">
        The palette is React state, held in a context above this page and above the corner control
        alike.
      </p>
      <button
        type="button"
        data-palette-toggle
        style={{ background: palette.background, color: palette.ink }}
        onClick={() => {
          toggle()
          leko.reached('palette-changed')
        }}
      >
        Palette: {palette.name}
      </button>
    </div>
  )
}

function TourClose() {
  const slot = useSyncExternalStore(closeSlot.subscribe, closeSlot.current, () => null)
  const { palette } = usePalette()
  return (
    slot &&
    createPortal(
      <button
        type="button"
        className="portal-close"
        data-palette={palette.name}
        style={{ background: palette.background, color: palette.ink }}
        onClick={slot.stop}
      >
        {palette.label}
      </button>,
      slot.root,
    )
  )
}

export const closeThroughAPortal: Case = {
  id: 'close-through-a-portal',
  title: 'The way out, drawn through a portal',

  proves:
    "A renderClose that hands its root to the app's own tree draws the way out " +
    "inside the app's providers, so it follows state the rest of the page follows.",

  options: {
    renderClose: (root, stop) => {
      fill({ root, stop })
      return () => fill(null)
    },
  },

  mount(root, leko) {
    const container = document.createElement('div')
    root.append(container)
    const app = createRoot(container)
    app.render(
      <StrictMode>
        <PaletteProvider>
          <Page leko={leko} />
          <TourClose />
        </PaletteProvider>
      </StrictMode>,
    )
    return () => {
      app.unmount()
      container.remove()
    }
  },

  stories: [
    {
      id: 'close-through-a-portal',
      steps: [
        {
          id: 'toggle',
          target: { elements: '[data-palette-toggle]', interactive: true },
          message:
            'The control in the corner is a component of this page, portalled into ' +
            'the box Leko placed. Switch the palette and watch it repaint.',
          awaits: 'palette-changed',
        },
        {
          id: 'corner',
          target: '[data-palette-panel]',
          message:
            "The corner control is drawn by the app's own tree, inside its providers, " +
            'which a separate createRoot in renderClose would not be. Press it to end the tour.',
        },
      ],
    },
  ],
}
