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
  // Relaxed rules for tests (tests/**): null-assertion + floating-promises
  // are idiomatic in Vitest suites — preserved from 001 baseline.
  // no-misused-promises kept `error` here (real async correctness rule).
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  // Cloudflare-test-specific relaxations for tests/worker/** only:
  // cloudflare:test SELF + env, Hono `app.request`, `vi.stubGlobal('fetch', ...)`
  // produce loosely-typed runtime fixtures whose `.status` / `.json()` / `.fetch()`
  // accesses cascade type-aware `unsafe-*` violations. Type-aware lint adds no
  // value here — vitest assertions enforce correctness. Scoped to worker tests
  // ONLY so tests/node/** keeps full type-aware coverage (incl. no-misused-promises
  // + require-await + unbound-method — real correctness rules).
  {
    files: ['tests/worker/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // mockImplementation(async () => Response) is the canonical pattern for
      // per-call Response construction in handler scope (per T034 fix-loop +
      // C1 review finding). Works with vi.fn()'s loose signature; the misused-
      // promises rule's "void return expected" complaint is a false positive
      // here (vi.fn() callback can return any). require-await fires because
      // the async fn body has no await — but `async () => new Response()` is
      // structurally identical to `() => Promise.resolve(new Response())` and
      // the async form is more readable.
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/require-await': 'off',
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
