import { story } from './story'
import { leko } from './tour'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <button id="save" type="button">Save</button>
  <p id="status"></p>
`

const status = document.querySelector<HTMLParagraphElement>('#status')!

function save() {
  status.textContent = 'Saved'
  leko.reached('profile-saved')
}

document.querySelector<HTMLButtonElement>('#save')!.addEventListener('click', save)

leko.start(story)
