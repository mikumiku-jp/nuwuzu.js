import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.js'],
  outfile: 'dist/index.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
});

console.log('Build complete: dist/index.cjs');
