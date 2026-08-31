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
      if (hint) hint.textContent = 'Submitted. In a real app this is where reached() goes.'
    })
    root.append(form)
    return () => form.remove()
  },

  stories: [
    {
      id: 'form-validation',
      steps: [
        {
          id: 'email',
          target: { elements: 'input[name="email"]', interactive: true },
          message: 'Enter the address you want to sign in with.',
          validate: (el) => /.+@.+\..+/.test((el as HTMLInputElement).value),
          // Under the instruction rather than over it. Pressing Next with an
          // empty field used to leave the step asking for nothing.
          error: 'That does not look like an email address yet.',
        },
        {
          id: 'password',
          target: { elements: 'input[name="password"]', interactive: true },
          message: 'Pick a password of at least eight characters.',
          validate: (el) => (el as HTMLInputElement).value.length >= 8,
          // Worked out from what was typed, which is what the function form is
          // for. Asked once, for the attempt that just failed.
          error: (el) =>
            `Eight characters at least, and that is ${(el as HTMLInputElement).value.length}.`,
        },
        {
          id: 'submit',
          target: { elements: 'button[type="submit"]', interactive: true },
          message: 'Now create the account.',
        },
      ],
    },
  ],
}
