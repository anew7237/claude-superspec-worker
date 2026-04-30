import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        // tsconfig.lint.json extends tsconfig.json with tests/ added to
        // include[]. Lets ESLint's type-aware rules parse test files
        // without forcing tsc --noEmit / tsc build to compile them
        // (which would break rootDir=src or pollute dist/).
        project: './tsconfig.lint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '.vitest-cache/', 'eslint.config.js'],
  },
  // Relaxed rules for tests: assertion-style null-assertions and
  // dynamic-import floating promises are idiomatic in Vitest suites.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  // SC-009: production code (src/) must not use console.*; tests are
  // exempt (the tests/** block above is unaffected — fixture noise OK).
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
);
