import { type Case, html } from '../case.js'

/**
 * Why an attempt failed is often a question for a server. `validate` is
 * synchronous and gives the verdict, and the reason arrives later, so
 * `onValidationError` is where the asking goes.
 *
 * That opens a window. The user is not made to wait for the reason, so they can
 * fix the field and move on while the request is still out. Whatever comes back
 * is about a step they have left.
 */
/** Stands in for the call a real checkout would make to find out. */
const whyNot = (code: string): Promise<string> =>
  new Promise((resolve) =>
    setTimeout(
      () =>
        resolve(
          code === 'WINTER'
            ? 'WINTER ran out of uses on 3 February.'
            : `“${code}” expired on 31 March.`,
        ),
      1200,
    ),
  )

export const lateReason: Case = {
  id: 'late-reason',
  title: 'A reason that arrives late',

  proves:
    'Why a step said no can take a moment to find out, and the answer can land ' +
    'after the user has moved on. It belongs to the attempt that asked, and it ' +
    'is dropped rather than shown under whatever step is up by then.',

  mount(root) {
    const panel = html(`
      <div class="panel">
        <h2>Checkout</h2>
        <label>Coupon code<input name="coupon" placeholder="SPRING" /></label>
        <button type="submit" data-place>Place order</button>
        <p class="hint">
          <strong>SPRING</strong> and <strong>WINTER</strong> are turned down, and
          finding out why takes 1200ms. <strong>AUTUMN</strong> is accepted.
        </p>
        <p class="hint">
          Press Next with <strong>SPRING</strong>. While it says “Checking…”,
          replace it with <strong>AUTUMN</strong> and press Next again. The verdict
          on SPRING comes back about a second later, and by then you are on a step
          it has nothing to say about.
        </p>
      </div>
    `)
    root.append(panel)
    return () => panel.remove()
  },

  stories: (root) => {
    const at = (selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!

    return [
      {
        id: 'late-reason',
        steps: [
          {
            id: 'coupon',
            target: at('input[name="coupon"]'),
            message: 'Enter a coupon code, then press Next.',
            // The verdict is local and immediate. Only the reason costs a
            // request, which is the shape `validate` being synchronous asks for.
            validate: (el) => (el as HTMLInputElement).value.trim().toUpperCase() === 'AUTUMN',
            onValidationError: async (el, utils) => {
              const code = (el as HTMLInputElement).value.trim().toUpperCase() || 'that code'
              utils.shake()
              utils.setError('Checking…')
              // Nothing waits for this, and nothing has to. The user is free to
              // fix the field and go on while it is out.
              utils.setError(await whyNot(code))
            },
          },
          {
            id: 'place',
            target: at('[data-place]'),
            message: 'Now place the order.',
          },
        ],
      },
    ]
  },
}
