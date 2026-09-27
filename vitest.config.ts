import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // tools/ holds standalone scripts with their own dependencies and their own
    // node:test suites (e.g. tools/testnet-a2u) — they are not backend code.
    exclude: [...configDefaults.exclude, 'tools/**'],
  },
});
