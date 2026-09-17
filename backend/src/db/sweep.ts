/**
 * Upload rows that never got confirmed. A browser that closed mid-PUT leaves a
 * `pending` row and possibly an object; neither is visible to the app, but
 * neither goes away on its own.
 *
 *   bun run files:sweep
 */
import { and, eq, lt } from 'drizzle-orm'
import { db, sql as rawSql } from './client'
import { files } from './schema'
import { deleteObjects } from '../lib/s3'

const MAX_AGE_MINUTES = Number(process.env.SWEEP_AFTER_MINUTES ?? 60)

const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60 * 1000)

const stale = await db
  .select()
  .from(files)
  .where(and(eq(files.state, 'pending'), lt(files.createdAt, cutoff)))

if (stale.length) {
  await db.delete(files).where(
    and(eq(files.state, 'pending'), lt(files.createdAt, cutoff)),
  )
  await deleteObjects(stale.map((row) => row.key))
}

console.log(`swept ${stale.length} unfinished upload${stale.length === 1 ? '' : 's'}`)
await rawSql.close()
