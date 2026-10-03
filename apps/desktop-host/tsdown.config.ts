import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig(['index', 'cli'].map(name => ({
  entry: ['lib/types/' + name + '.js'],
  outDir: 'lib',
  format: ['esm'] as const,
  outputOptions: { codeSplitting: false },
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  plugins: [{
    name: 'nidofy-workbench-adapters',
    resolveId(source, importer) {
      if (importer?.replaceAll('\\', '/').endsWith('/lib/types/workbench/owner.js')
        && /^\.\/legacy\/[a-z-]+\.mjs$/.test(source)) {
        return fileURLToPath(new URL(`./src/workbench/${source}`, import.meta.url))
      }
    },
  }],
})))
