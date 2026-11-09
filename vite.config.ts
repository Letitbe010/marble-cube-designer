import { defineConfig } from 'vitest/config';

// GitHub Pages serves the app from /<repo>/, so built asset URLs need that prefix.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/marble-cube-designer/' : '/',
  test: { include: ['src/**/*.test.ts'] },
}));
