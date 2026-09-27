// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

// English only, deliberately. `README.ja.md` translates the opening of the
// README and stops there, because a translation that goes out of date misleads
// and nobody notices. A site multiplies that surface, so it does not have one.
export default defineConfig({
  site: 'https://annetaan.github.io',
  base: '/leko',
  integrations: [
    starlight({
      title: 'Leko',
      description:
        'A product tour that cuts a hole in the overlay, so the user works the real element underneath.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/annetaan/leko' }],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What Leko is', slug: 'what-leko-is' },
            { label: 'Getting started', slug: 'getting-started' },
          ],
        },
        {
          label: 'Guides',
          items: [{ label: 'React, Vue and a plain script', slug: 'guides/frameworks' }],
        },
        { label: 'How it works', items: [{ label: 'The lifecycle', slug: 'lifecycle' }] },
        { label: 'Proving the ground', items: [{ label: 'Playground', slug: 'playground' }] },
        {
          label: 'Reference',
          items: [
            { label: 'createLeko and options', slug: 'reference/create-leko' },
            { label: 'Leko', slug: 'reference/leko' },
            { label: 'Story and step', slug: 'reference/story-and-step' },
            { label: 'Problems', slug: 'reference/problems' },
            { label: 'Signal types', slug: 'reference/signal-types' },
            { label: 'CSS custom properties', slug: 'reference/css-custom-properties' },
          ],
        },
      ],
      customCss: ['./src/styles/docs.css'],
      // The scrim covers the page and the message sits beside the cutout, so a
      // tour running here has to be able to point at the site's own chrome.
      // Nothing about that works if Starlight's header outranks it.
      credits: false,
    }),
  ],
})
