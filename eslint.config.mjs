import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'lib/generated/**']),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { varsIgnorePattern: '^_|^[A-Z].*Type$', argsIgnorePattern: '^_' },
      ],
      'no-useless-escape': 'warn',
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'jsx-quotes': ['error', 'prefer-single'],
    },
  },
  {
    plugins: {
      'no-relative-import-paths': noRelativeImportPaths,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'no-relative-import-paths/no-relative-import-paths': [
        'error',
        { allowSameFolder: false, prefix: '@', rootDir: '.' },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
]);
