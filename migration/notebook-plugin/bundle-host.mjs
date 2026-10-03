import { build } from 'tsdown'
await build({ config: false, entry: ['lib/types/index.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024', fixedExtension: false, clean: false, dts: false })
