import { type Case, html } from '../case.js'

// Three elements, one selector. Which of them a step means is the step's to
// say — DESIGN.md, **Which of several matches a selector means** — and the
// three stories below are the three rules over the same three matches. The
// default is the first of them and does not move: a host that upgraded and
// found its tours pointing somewhere else would have nothing in its own code
// to look at.
//
// The rule is applied after `onEnter` returns, which the second story is
// about: the copy it opens the panel for is a copy `visible-first` can then
// reach. And the third rule needs the viewer to have scrolled, which is why the
// page is tall: what is in the viewport is a fact about where the page is, not
// about the markup.
export const whichMatch: Case = {
  id: 'which-match',
  title: 'Which of several matches a step means',
  proves:
    'A selector that matches three elements means the first of them, and a ' +
    'step can ask for something narrower instead: the first the viewer could ' +
    'see, or the first inside the viewport. The default does not change — the ' +
    'story that asks for nothing points at the copy in the collapsed panel and ' +
    'ends with target-lost, exactly as it did before there was a rule to ask ' +
    'for. And because the rule is applied after onEnter returns, a step that ' +
    'opens the panel first gets the copy inside it.',

  mount(root) {
    const page = html(`
      <div class="tall-page">
        <div class="panel">
          <h2>Invoice</h2>
          <div data-compact style="display: none">
            <p class="hint">
              The compact layout, which this screen only shows on a narrow
              window. <strong>It is the first thing the selector matches.</strong>
            </p>
            <button type="button" data-save>Save (compact)</button>
          </div>
          <p class="hint">
            <strong>Three buttons match <code>[data-save]</code></strong>: the
            one in the compact layout just above, hidden with
            <code>display: none</code>; this one, on screen; and one at the foot
            of the form, a screen further down.
          </p>
          <button type="button" data-save>Save</button>
          <p class="hint">
            <strong><code>start('which-match-first')</code> asks for no rule.</strong>
            So the selector means its first match, the compact one, and that one
            is not rendered: nothing is drawn, and the tour ends with
            <code>target-lost</code> after its moment of waiting. The console
            below has it. That is what a selector has always meant, and it is
            still the default.
          </p>
          <p class="hint">
            <strong><code>start('which-match-visible')</code> asks for
            <code>visible-first</code>.</strong> The compact copy has no box, so
            the first step points at the button above. Then <strong>Next</strong>:
            the second step opens the compact layout in its <code>onEnter</code>,
            and the rule is applied after that returns, so the hole moves up
            into the panel. <code>onLeave</code> folds it away again.
          </p>
          <p class="hint">
            <strong><code>start('which-match-in-viewport')</code> asks for
            <code>in-viewport-first</code>.</strong> Start it from here and it
            points at the button above, the same as the rule before it. Scroll
            to the foot of the form and start it there: the button above is
            perfectly visible and no part of it is on screen, so the rule passes
            over it for the one that is.
          </p>
        </div>

        <p class="hint">
          A screen of nothing, so that the two remaining copies are never on
          screen together.
        </p>
        <div class="scroll-room"></div>

        <div class="milestone">
          <h3>The foot of the form</h3>
          <button type="button" data-save>Save</button>
          <p class="hint">
            The third match. <code>visible-first</code> never reaches it — the
            copy in the panel above passes that rule from wherever the page is —
            and <code>in-viewport-first</code> reaches it whenever the panel's
            copy has scrolled away.
          </p>
        </div>
      </div>
    `)

    const compact = page.querySelector<HTMLElement>('[data-compact]')!
    root.append(page)
    return () => {
      // The story's own `onLeave` folds it away, and a case torn down mid-tour
      // never gets one.
      compact.style.display = 'none'
      page.remove()
    }
  },

  stories: [
    {
      id: 'which-match-first',
      steps: [
        {
          // No `resolve`, so `first`: the compact copy, which has no box. A
          // step whose target is not rendered is a step whose target is not
          // there — `hidden-target.ts` is that half on its own.
          id: 'the-first-match',
          target: { elements: '[data-save]', interactive: true },
          message: 'This step is never drawn: its first match is the copy in the compact layout.',
        },
      ],
    },
    {
      id: 'which-match-visible',
      steps: [
        {
          id: 'the-visible-match',
          target: { elements: '[data-save]', interactive: true },
          resolve: 'visible-first',
          message:
            'The compact copy has no box, so the rule passed over it and the ' +
            'hole is around the button on screen. Next opens the compact layout.',
        },
        {
          id: 'the-revealed-match',
          target: { elements: '[data-save]', interactive: true },
          resolve: 'visible-first',
          message:
            'The compact layout was opened in this step’s onEnter, so by the ' +
            'time the rule was applied its copy was the first one showing.',
          onEnter: () => {
            document.querySelector<HTMLElement>('[data-compact]')!.style.display = ''
          },
          onLeave: () => {
            document.querySelector<HTMLElement>('[data-compact]')!.style.display = 'none'
          },
        },
      ],
    },
    {
      id: 'which-match-in-viewport',
      steps: [
        {
          id: 'the-match-on-screen',
          target: { elements: '[data-save]', interactive: true },
          resolve: 'in-viewport-first',
          // No `scroll`: the two do not combine, and DESIGN.md says why under
          // **Which of several matches a selector means**. What is on screen is
          // where the viewer left the page.
          message:
            'The first match with any of itself on screen. Start this story ' +
            'from the top of the page and from the foot of the form, and it is ' +
            'two different buttons.',
        },
      ],
    },
  ],
}
