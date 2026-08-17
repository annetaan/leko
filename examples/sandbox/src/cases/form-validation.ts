import { type Case, html } from '../case.js'

// The case the whole library exists for: the step does not advance because a
// click happened, it advances because the application looked at its own state
// and decided the user actually got it right.
export const formValidation: Case = {
  id: 'form-validation',
  title: 'Form validation',
  proves:
    'A step advances on the application’s own verdict. Typing anything is not ' +
    'success; typing a well-formed address is.',

  mount(root) {
    const form = html<HTMLFormElement>(`
      <form class="panel" novalidate>
        <h2>Create your account</h2>
        <label>Email<input name="email" type="email" placeholder="you@example.com" /></label>
        <label>Password<input name="password" type="password" /></label>
        <button type="submit">Create account</button>
        <p class="hint" data-hint></p>
      </form>
    `)
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      const hint = form.querySelector<HTMLElement>('[data-hint]')
      if (hint) hint.textContent = 'Submitted. In a real app this is where nextStep() goes.'
    })
    root.append(form)
    return () => form.remove()
  },

  stories: (root) => [
    {
      id: 'form-validation',
      steps: [
        {
          id: 'email',
          target: root.querySelector<HTMLElement>('input[name="email"]')!,
          message: 'Enter the address you want to sign in with.',
          validate: (el) => /.+@.+\..+/.test((el as HTMLInputElement).value),
          onValidationError: (_el, utils) => {
            utils.shake()
            // Under the instruction rather than over it. Pressing Next with an
            // empty field used to leave the step asking for nothing.
            utils.setError('That does not look like an email address yet.')
          },
        },
        {
          id: 'password',
          target: root.querySelector<HTMLElement>('input[name="password"]')!,
          message: 'Pick a password of at least eight characters.',
          validate: (el) => (el as HTMLInputElement).value.length >= 8,
        },
        {
          id: 'submit',
          target: root.querySelector<HTMLElement>('button[type="submit"]')!,
          message: 'Now create the account.',
        },
      ],
    },
  ],
}
