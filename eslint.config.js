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
  // FR-022 cross-runtime import ban — mechanical via no-restricted-imports.
  // Companion to dual `tsconfig.{node,worker}.json`'s ambient/`node:*`
  // mechanical strength: closes the explicit-named-import gap that the
  // tsconfig types[] mechanism cannot enforce (per
  // specs/002-cloudflare-worker/contracts/dual-tsconfig.md §3.1 +
  // .docs/baseline-traceability-matrix.md FR-022 row).
  //
  // Scope: src/{node,worker,shared}/**. Tests are exempt — test fixtures
  // legitimately reach across runtimes (e.g. tests/worker/** asserts on
  // Node-shaped responses via fetch).
  {
    files: ['src/node/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cloudflare/workers-types', '@cloudflare/workers-types/*'],
              message:
                'Worker-only types in Node code (FR-022 violation; Node runtime cannot use D1/KV/Workers globals).',
            },
            {
              group: ['cloudflare:*'],
              message: 'Worker-only Cloudflare module imports in Node code (FR-022 violation).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/worker/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pg', 'pg/*'],
              message:
                'Node-only Postgres driver in Worker code (FR-022; Workers runtime has no TCP socket support for pg).',
            },
            {
              group: ['redis', 'redis/*'],
              message:
                'Node-only Redis client in Worker code (FR-022; use Workers KV / Durable Objects instead).',
            },
            {
              group: ['pino', 'pino/*'],
              message:
                'Node-only logger in Worker code (FR-022; use console.* — Workers Logs handles structured output).',
            },
            {
              group: ['prom-client', 'prom-client/*'],
              message:
                'Node-only Prometheus client in Worker code (FR-022; Workers metrics go via Analytics Engine / Workers Observability).',
            },
            {
              group: ['@hono/node-server', '@hono/node-server/*'],
              message:
                'Node-only Hono adapter in Worker code (FR-022; Workers entry uses default-export ExportedHandler, not @hono/node-server).',
            },
            {
              group: ['node:*'],
              message:
                'Node builtins in Worker code (FR-022; Workers runtime is not Node — no node:fs / node:path / node:crypto without nodejs_compat flag, which is forbidden by Constitution).',
            },
          ],
        },
      ],
    },
  },
  // src/shared/** is included by BOTH tsconfig.node.json and
  // tsconfig.worker.json. To stay runtime-agnostic, the union of both
  // ban-lists applies — anything banned in either runtime is also
  // banned here. (See src/shared/types.ts header CONSTRAINT block.)
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@cloudflare/workers-types', '@cloudflare/workers-types/*'],
              message:
                'Worker-only types in shared code (FR-022; src/shared MUST be runtime-agnostic).',
            },
            {
              group: ['cloudflare:*'],
              message: 'Worker-only Cloudflare imports in shared code (FR-022).',
            },
            {
              group: ['pg', 'pg/*'],
              message: 'Node-only Postgres driver in shared code (FR-022).',
            },
            {
              group: ['redis', 'redis/*'],
              message: 'Node-only Redis client in shared code (FR-022).',
            },
            {
              group: ['pino', 'pino/*'],
              message: 'Node-only logger in shared code (FR-022).',
            },
            {
              group: ['prom-client', 'prom-client/*'],
              message: 'Node-only Prometheus client in shared code (FR-022).',
            },
            {
              group: ['@hono/node-server', '@hono/node-server/*'],
              message: 'Node-only Hono adapter in shared code (FR-022).',
            },
            {
              group: ['node:*'],
              message:
                'Node builtins in shared code (FR-022; src/shared MUST be runtime-agnostic).',
            },
          ],
        },
      ],
    },
  },
);
