import {
  edgesOf,
  type Layout,
  lineAt,
  type Position,
  positionAt,
  triggers,
  type Tuning,
} from './geometry.js'

// The state, and what an event does to it. Pure, so `plan.test.ts` drives it
// in Node, and the shell is a `switch` over the effects —
// [The core and the shell](../DESIGN.md#the-core-and-the-shell). Every case
// below is a bullet of
// [What was seen before decides what is drawn](../DESIGN.md#what-was-seen-before-decides-what-is-drawn).

/**
 * - `out` — the light is out, or was never on.
 * - `converging` — closing in on `to`, and nothing announced yet.
 * - `lit` — `on` arrived and was announced.
 * - `morphing` — on its way from `from`, which was announced, to `to`.
 */
export type Mode =
  | { readonly kind: 'out' }
  | { readonly kind: 'converging'; readonly to: number }
  | { readonly kind: 'lit'; readonly on: number }
  | { readonly kind: 'morphing'; readonly from: number; readonly to: number }

export interface State {
  readonly tuning: Tuning
  readonly layout: Layout
  readonly scrollY: number
  /** The opacity last written, and 0 while the light is out. */
  readonly opacity: number
  readonly mode: Mode
}

export type Event =
  | { type: 'scroll'; scrollY: number }
  | { type: 'measured'; layout: Layout; scrollY: number }
  /** The converge or the morph the shell is running got to the end. */
  | { type: 'arrived' }

export type Effect =
  | { effect: 'opacity'; value: number }
  /** Close in on `to` from wherever the hole is, or from the viewport when none is drawn. */
  | { effect: 'converge'; to: number }
  /** Move the hole from wherever it is to `to`. The message and the halo go for the flight. */
  | { effect: 'morph'; to: number }
  /** Put the hole on `on` where it now is, with no animation. */
  | { effect: 'place'; on: number }
  /** The hole has arrived at `on`: show its message and its halo. */
  | { effect: 'reveal'; on: number }
  /** Take everything off the page, and stop whatever is running. */
  | { effect: 'out' }
  | { effect: 'notify'; index: number | undefined }

export interface Outcome {
  readonly state: State
  readonly effects: Effect[]
}

const positionOf = (tuning: Tuning, layout: Layout, scrollY: number): Position => {
  const switches = triggers(tuning, layout)
  return positionAt(lineAt(scrollY, tuning, layout), switches, edgesOf(tuning, layout, switches))
}

/** Created with the line inside the range, it converges; anywhere else it is out. */
export function create(tuning: Tuning, layout: Layout, scrollY: number): Outcome {
  const pos = positionOf(tuning, layout, scrollY)
  const at = { tuning, layout, scrollY }
  if (pos.zone === 'inside') {
    return {
      state: { ...at, opacity: 1, mode: { kind: 'converging', to: pos.target } },
      effects: [
        { effect: 'opacity', value: 1 },
        { effect: 'converge', to: pos.target },
      ],
    }
  }
  return {
    state: { ...at, opacity: 0, mode: { kind: 'out' } },
    effects: [{ effect: 'notify', index: undefined }],
  }
}

export function reduce(state: State, event: Event): Outcome {
  const { mode } = state

  if (event.type === 'arrived') {
    if (mode.kind !== 'converging' && mode.kind !== 'morphing') return { state, effects: [] }
    return {
      state: { ...state, mode: { kind: 'lit', on: mode.to } },
      effects: [
        { effect: 'notify', index: mode.to },
        { effect: 'reveal', on: mode.to },
      ],
    }
  }

  const layout = event.type === 'measured' ? event.layout : state.layout
  const measured = event.type === 'measured'
  const pos = positionOf(state.tuning, layout, event.scrollY)
  const moved = { ...state, layout, scrollY: event.scrollY }
  const opacity: Effect[] =
    pos.opacity === state.opacity ? [] : [{ effect: 'opacity', value: pos.opacity }]

  switch (mode.kind) {
    case 'out': {
      if (pos.zone !== 'inside') return { state: moved, effects: [] }
      return {
        state: { ...moved, opacity: 1, mode: { kind: 'converging', to: pos.target } },
        effects: [...opacity, { effect: 'converge', to: pos.target }],
      }
    }

    case 'converging': {
      if (pos.zone === 'gone') {
        return {
          state: { ...moved, opacity: 0, mode: { kind: 'out' } },
          effects: [{ effect: 'out' }],
        }
      }
      const turned = pos.target !== mode.to
      return {
        state: { ...moved, opacity: pos.opacity, mode: { kind: 'converging', to: pos.target } },
        effects:
          turned || measured ? [...opacity, { effect: 'converge', to: pos.target }] : opacity,
      }
    }

    case 'lit': {
      // A band keeps the light on `on`, and a measure can leave `on` with no
      // box to keep it on — [Measuring](../DESIGN.md#measuring).
      const lost = pos.zone === 'band' && layout.boxes[mode.on] === undefined
      if (pos.zone === 'gone' || lost) {
        return {
          state: { ...moved, opacity: 0, mode: { kind: 'out' } },
          effects: [{ effect: 'out' }, { effect: 'notify', index: undefined }],
        }
      }
      if (pos.zone === 'inside' && pos.target !== mode.on) {
        return {
          state: {
            ...moved,
            opacity: pos.opacity,
            mode: { kind: 'morphing', from: mode.on, to: pos.target },
          },
          effects: [...opacity, { effect: 'morph', to: pos.target }],
        }
      }
      // Still lit on `on`, in a band as much as inside, so a measure puts its
      // hole back where it now is — [Measuring](../DESIGN.md#measuring).
      return {
        state: { ...moved, opacity: pos.opacity },
        effects: measured ? [...opacity, { effect: 'place', on: mode.on }] : opacity,
      }
    }

    case 'morphing': {
      if (pos.zone === 'gone') {
        return {
          state: { ...moved, opacity: 0, mode: { kind: 'out' } },
          effects: [{ effect: 'out' }, { effect: 'notify', index: undefined }],
        }
      }
      const turned = pos.target !== mode.to
      return {
        state: {
          ...moved,
          opacity: pos.opacity,
          mode: { kind: 'morphing', from: mode.from, to: pos.target },
        },
        effects: turned || measured ? [...opacity, { effect: 'morph', to: pos.target }] : opacity,
      }
    }
  }
}
