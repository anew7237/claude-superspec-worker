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
    ignores: [
      'dist/',
      'node_modules/',
      'coverage/',
      '.vitest-cache/',
      '.wrangler/',
      'eslint.config.js',
    ],
  },
  // Repo-wide convention (per 設計源 §2.3 lesson 5): underscore-prefixed
  // args/vars are intentionally unused (e.g. Hono's `app.onError((err, _c)
  // => ...)`). ESLint 9 doesn't auto-ignore `_` prefix by default, so we
  // opt in here.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Relaxed rules for tests: cloudflare:test SELF / Hono `app.request` /
  // vitest `vi.fn()` / `vi.mocked(...)` are loosely-typed runtime fixtures
  // that cascade into `unsafe-*` violations whenever a test reads `.status`
  // / `.json()` / `.fetch()` off them. Type-aware lint rules don't add
  // value here — vitest itself enforces correctness via test assertions.
  // Keep the previous null-assertion + floating-promise relaxations from
  // 001 baseline.
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
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
  // Worker-side observability uses console.log/error as the log channel
  // (per worker-routes.md §6 invariant 3 + FR-010 — Workers Logs + `wrangler tail`).
  // This overrides the SC-009 src/** no-console rule for src/worker/** only.
  {
    files: ['src/worker/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
