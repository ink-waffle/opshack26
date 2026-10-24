import { defineConfig } from 'prisma/config';

// Env comes from the `dotenv -e` wrapper in package.json scripts; Prisma 7 loads no .env itself.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DIRECT_URL },
});
