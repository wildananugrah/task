import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { env } from '../lib/env'
import * as schema from './schema'

// Bun's own Postgres driver: one less dependency than node-postgres, and it
// pools by default.
export const sql = new SQL({ url: env.databaseUrl, max: 10 })

export const db = drizzle({ client: sql, schema })

export type Db = typeof db
export { schema }
