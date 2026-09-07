import { lekoSignals } from '@annetaan/leko-codegen/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // The `development` export condition — CONTRIBUTING.md, **Seeing it run**.
  resolve: { conditions: ['development'] },
  // Relative, so the built sandbox works from a project page as well as a root.
  base: './',
  // `packages/codegen/README.md` says what this writes and when. Into src/
  // because that is what this project's tsconfig takes in: a declaration file
  // outside it is compiled by nobody.
  plugins: [lekoSignals({ out: 'src/leko-signals.d.ts' })],
})
