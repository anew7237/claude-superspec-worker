import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/app';
export const pool = new Pool({ connectionString });
