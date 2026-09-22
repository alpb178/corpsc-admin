import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 saca la URL de conexión del schema: el CLI (migrate, studio, seed)
// la lee de aquí, y el cliente en runtime la recibe vía driver adapter en
// src/prisma/prisma.service.ts.
//
// El CLI prefiere DIRECT_URL: `migrate deploy` toma un advisory lock de sesión
// y se cuelga detrás de un pooler en modo transacción (Supabase, puerto 6543).
// El runtime sigue usando DATABASE_URL, que sí puede ir por el pooler.
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
