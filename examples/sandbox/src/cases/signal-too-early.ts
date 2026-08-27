import { at, html, type Case } from '../case.js'

// The race the gate exists for. The application reports something true while
// the step waiting for that name is still being built, and Leko drops the call
// rather than saving it. A step advancing on something that happened before it
// began is worse than a step that waits.
//
// Everything here is on a timer on purpose. The point is that neither side did
// anything wrong: the request came back when it came back, and the step took as
// long as it took.
export const signalTooEarly: Case = {
  id: 'signal-too-early',
  title: 'A signal that arrived too early',

  proves:
    'A signal reported while the step waiting for it is still in its onEnter ' +
    'is dropped, and onDiagnostic is the only thing that says so.',

  mount(root, leko) {
    const panel = html(`
      <div class="panel">
        <h2>Order 4471</h2>
        <p class="hint">Sending takes 400ms. Fetching the receipt takes 900ms.</p>
        <button type="button" data-send>Send the order</button>
        <p class="hint" data-status data-sent="no">Nothing sent yet.</p>
        <button type="button" data-again>Ask for the receipt again</button>
      </div>
    `)
    const status = panel.querySelector<HTMLElement>('[data-status]')!
    const send = panel.querySelector<HTMLButtonElement>('[data-send]')!

    send.addEventListener('click', () => {
      send.disabled = true
      status.textContent = 'Sending…'

      // The step this moves on to is told to wait for `order-sent`, and that
      // step spends 900ms building itself. This lands at 400ms, in the middle
      // of it.
      leko.reached('order-placed')

      setTimeout(() => {
        status.textContent = 'Sent. Receipt 4471-A.'
        status.dataset['sent'] = 'yes'
        leko.reached('order-sent')
      }, 400)
    })

    // The same call, made once the step is standing rather than while it was
    // being built. Nothing about the call is different. The moment is.
    panel.querySelector('[data-again]')!.addEventListener('click', () => {
      if (status.dataset['sent'] === 'yes') leko.reached('order-sent')
    })

    root.append(panel)
    return () => panel.remove()
  },

  stories: [
    {
      id: 'receipt',
      onEnter: () => {
        const status = at('[data-status]')
        ;(at('[data-send]') as HTMLButtonElement).disabled = false
        status.textContent = 'Nothing sent yet.'
        status.dataset['sent'] = 'no'
      },
      steps: [
        {
          id: 'send',
          target: '[data-send]',
          message: 'Send it. The request behind this takes 400ms.',
          awaits: 'order-placed',
        },
        {
          id: 'receipt',
          // Two adjacent elements as one cutout, so the button below the line
          // is inside the hole and can still be pressed.
          target: [['[data-status]', '[data-again]']],
          message:
            'This step spent 900ms fetching the receipt. The order-sent ' +
            'call landed at 400ms, inside that window, and was dropped. ' +
            'Press the button to make the same call again.',
          awaits: 'order-sent',
          // Declared, because 900ms is known here rather than guessed at.
          // The instance default would wait 250ms of it out first.
          curtain: true,

          // Whatever the application really does here. What matters is that
          // it takes longer than the thing the user already set going.
          onEnter: () => new Promise<void>((resolve) => setTimeout(resolve, 900)),
        },
        {
          id: 'done',
          target: '[data-status]',
          message: 'The second call moved the story on, because this time the step was standing.',
        },
      ],
    },
  ],
}
