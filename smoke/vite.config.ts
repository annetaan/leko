import { lekoSignals } from '@annetaan/leko-codegen/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [lekoSignals({ out: 'src/leko-signals.d.ts' })],
})
