import { createClient } from 'redis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
export const redis = createClient({ url });

// Connection is established by src/index.ts during server startup.
// Keeping module load side-effect free makes `vitest` import safe.
