import type { LekoStory } from '@annetaan/leko'

import { type Case, html } from '../case.js'

// A target that fills the screen: a map under an app bar, which is the page
// #108 was reported against. No side of the map has room for the message, so
// the box docks at the foot of the screen the way a step with no target puts
// it, and its Next control stays there to be pressed — DESIGN.md, **The
// message**.
//
// Read it at desktop width. The sandbox's rail and footer take most of a
// phone-sized window, so the map would not fill it. #108's phone, 390x844, is
// held by the tests instead: `a shown hole with no side that has room docks
// the message` in `packages/spotlight/src/geometry.test.ts`, and `a shown hole
// where no side has room docks the message, and its control can be pressed` in
// `packages/leko/src/message.test.ts`.
//
// Both steps only show their hole. A step that opened the map could not dock
// over it, so its message is held off the map and runs off the screen; a case
// built on a box nobody can see proves nothing, so there is no such step here.

// #region The story
const story = {
  id: 'screen-filling-hole',
  steps: [
    {
      id: 'map',
      target: '[data-map]',
      message:
        'The map fills the screen under the bar, so there is no side of it ' +
        'with room for this box. It docks at the foot of the screen instead, ' +
        'and Next is here to be pressed.',
    },
    {
      id: 'search',
      target: '[data-map-search]',
      message: 'The search field leaves the map below it, and the box is back beside its hole.',
    },
  ],
} satisfies LekoStory
// #endregion

export const screenFillingHole: Case = {
  id: 'screen-filling-hole',
  title: 'A hole that fills the screen',

  proves:
    'When no side of a hole the step only shows has room for the message, ' +
    'such as a map filling a phone screen under its bar, the message docks ' +
    'at the foot of the screen and its Next control stays on screen to be ' +
    'pressed.',

  mount(root) {
    const bar = html(`
      <div class="map-bar">
        <input type="search" placeholder="Search places" aria-label="Search places" data-map-search />
      </div>
    `)
    const map = html(`
      <div class="map" data-map aria-label="Map" role="img">
        <span class="map-pin" style="left: 30%; top: 35%"></span>
        <span class="map-pin" style="left: 62%; top: 58%"></span>
        <span class="map-pin" style="left: 45%; top: 78%"></span>
      </div>
    `)

    root.append(bar, map)
    return () => {
      bar.remove()
      map.remove()
    }
  },

  stories: [story],
}
