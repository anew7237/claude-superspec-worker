// Typed env helper for worker tests.
//
// `cloudflare:test` exports `env` typed loosely; until `declare module
// 'cloudflare:test' { interface ProvidedEnv }` augmentation is reliable
// (per 設計源 §2.3 lesson 3 + research.md §3.3), tests cast at use-site —
// repeated in d1/kv/proxy tests. This helper centralizes the cast.

import { env } from 'cloudflare:test';
import type { Env } from '../../src/worker/env.ts';

export function getEnv(): Env {
  return env as unknown as Env;
}
