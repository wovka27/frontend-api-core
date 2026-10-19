import { defineConfig, type Options } from 'tsup';

const baseConfig: Options = {
  format: ['esm'],
  dts: true,
  splitting: true,
  sourcemap: false,
  treeshake: true,
  minify: true,
  external: ['axios'],
};

export default defineConfig([
  {
    ...baseConfig,
    entry: { index: 'src/index.ts' },
    clean: true,
  },
]);
