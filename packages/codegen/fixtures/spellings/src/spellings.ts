import { createLeko } from '@annetaan/leko'

const leko = createLeko()

leko.reached('direct')
leko?.reached('optional')
leko['reached']('by-bracket')
// oxfmt-ignore
;(leko.reached)('by-parens')
leko.reached.call(leko, 'by-call')
leko.reached.apply(leko, ['by-apply'])
const bound = leko.reached.bind(leko)
bound('by-bind')
const { reached } = leko
reached('by-destructuring')
const maybe = Math.random() > 0.5 ? leko : undefined
maybe?.['reached']('by-optional-bracket')
