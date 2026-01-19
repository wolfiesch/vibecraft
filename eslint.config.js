import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // Global ignores must come first
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'hooks/rust/**',
      'bin/**',
      '*.js',
      '*.cjs',
      '*.mjs',
      'playwright.config.ts',
      'vitest.config.ts',
      'lint-staged.config.js',
      'eslint.config.js',
      'vite.config.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // Relax unused vars to warning for gradual cleanup
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-object-type': 'warn',
      // Allow console for server code (common in Node.js)
      'no-console': 'off',
      // Allow control characters in regex (for ANSI escape handling)
      'no-control-regex': 'off',
      // Allow case declarations (sometimes needed)
      'no-case-declarations': 'warn',
    },
  }
)
