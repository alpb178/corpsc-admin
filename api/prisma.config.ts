import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 takes the connection URL out of the schema: the CLI (migrate,
// studio, seed) reads it from here, and the runtime client receives it via a
// driver adapter in src/prisma/prisma.service.ts.
//
// The CLI prefers DIRECT_URL: `migrate deploy` takes a session advisory lock
// and hangs behind a pooler in transaction mode (Supabase, port 6543).
// The runtime keeps using DATABASE_URL, which can go through the pooler.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
