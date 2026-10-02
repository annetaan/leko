import type { LekoStory } from '@annetaan/leko'

export const story = {
  id: 'smoke',
  steps: [
    {
      id: 'save',
      target: { elements: '#save', interactive: true },
      message: 'Press Save. This step moves on when the save has finished.',
      awaits: 'profile-saved',
    },
  ],
} satisfies LekoStory
