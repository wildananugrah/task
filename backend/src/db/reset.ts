/**
 * Drops and rebuilds the schema. Development only — it is the fastest way back
 * to a known state, and it will refuse to run against a production database.
 *
 *   bun run db:reset && bun run db:seed
 */
import { sql } from './client'
import { env } from '../lib/env'

if (env.isProduction) {
  console.error('db:reset refuses to run with NODE_ENV=production')
  process.exit(1)
}

await sql`drop schema if exists public cascade`
await sql`create schema public`

// Drizzle records applied migrations in its OWN schema, which a `drop schema
// public` leaves standing. Without this the next db:migrate believes 0000 has
// already run, reports success, and leaves an empty database behind.
await sql`drop schema if exists drizzle cascade`

console.log('schema dropped; run db:migrate next')
await sql.close()
