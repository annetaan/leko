import { defineConfig } from 'vite'

export default defineConfig({
  // Resolve @annetaan/leko through its `development` export condition, which
  // points at src rather than dist. No watch process to keep running, and no
  // way to end up debugging a stale build.
  resolve: { conditions: ['development'] },
  // Relative, so the built sandbox works from a project page as well as a root.
  base: './',
})
