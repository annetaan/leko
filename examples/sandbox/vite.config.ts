import { lekoSignals } from '@annetaan/leko-codegen/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // Resolve @annetaan/leko through its `development` export condition, which
  // points at src rather than dist. No watch process to keep running, and no
  // way to end up debugging a stale build.
  resolve: { conditions: ['development'] },
  // Relative, so the built sandbox works from a project page as well as a root.
  base: './',
  // Writes src/leko-signals.d.ts from the reached() calls in this project, and
  // keeps writing it while the dev server runs. Add a case with a new signal and
  // the name is offered on `awaits` without anyone declaring it anywhere.
  //
  // Into src/ because that is what this project's tsconfig takes in. A
  // declaration file outside it is compiled by nobody.
  plugins: [lekoSignals({ out: 'src/leko-signals.d.ts' })],
})
