import { defineConfig } from 'vite'

export default defineConfig({
  // The `development` export condition — CONTRIBUTING.md, **Seeing it run**.
  resolve: { conditions: ['development'] },
  // Relative, so the built page works from a project page as well as a root.
  base: './',
})
