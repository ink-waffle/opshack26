import { defineConfig } from 'vitest/config';

// `@/` aliases come from tsconfig paths; env comes from the `dotenv -e` wrapper in package.json.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '.next/**', '.trigger/**', 'lib/generated/**'],
  },
});
