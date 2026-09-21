import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 saca la URL de conexión del schema: el CLI (migrate, studio, seed)
// la lee de aquí, y el cliente en runtime la recibe vía driver adapter en
// src/prisma/prisma.service.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
