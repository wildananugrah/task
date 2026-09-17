/**
 * Tests run against their own database, created here if it does not exist and
 * migrated from the same files production uses. DATABASE_URL is rewritten
 * before anything imports the client, which is why this is a preload.
 */
import { SQL } from 'bun'

const base = process.env.DATABASE_URL ?? 'postgres://taskspace:taskspace@localhost:5432/taskspace'
const testUrl =
  process.env.TEST_DATABASE_URL ??
  base.replace(/\/([^/?]+)(\?|$)/, (_match, name: string, tail: string) => `/${name}_test${tail}`)

process.env.DATABASE_URL = testUrl
process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET ??= 'test-session-secret'
process.env.WS_TICKET_SECRET ??= 'test-ws-ticket-secret'
process.env.S3_BUCKET ??= 'taskspace-test'
process.env.S3_ACCESS_KEY_ID ??= 'test-key'
process.env.S3_SECRET_ACCESS_KEY ??= 'test-secret'
process.env.S3_ENDPOINT ??= 'http://localhost:9000'

const name = new URL(testUrl).pathname.slice(1)
const admin = new SQL({ url: new URL('/postgres', testUrl).toString(), max: 1 })

const [existing] = await admin`select 1 as ok from pg_database where datname = ${name}`
if (!existing) await admin.unsafe(`create database "${name}"`)
await admin.close()

const { db, sql } = await import('../src/db/client')
const { migrate } = await import('drizzle-orm/bun-sql/migrator')
await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })

export { db, sql }
