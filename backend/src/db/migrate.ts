/**
 * Applies the SQL files in ./drizzle. Kept separate from `drizzle-kit push`
 * because push diffs a live database and can silently drop a column; a
 * migration file is reviewable, replayable, and the same on every machine.
 *
 *   bun run db:migrate
 */
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { db, sql } from './client'

await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })
console.log('migrations applied')
await sql.close()
