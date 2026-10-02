import type { LekoStep } from '@annetaan/leko'

// The directive holds only while the generated `leko-signals.d.ts` applies.
export const typo: LekoStep = {
  id: 'typo',
  target: '#save',
  // @ts-expect-error nothing in the project reports this name, so `LekoStrict`
  // refuses it.
  awaits: 'profile-svaed',
}
