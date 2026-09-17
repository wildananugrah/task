import { Hono } from 'hono'
import { searchTasks } from '../lib/queries'
import { requireUser, type AppEnv } from '../middleware/session'

export const searchRoutes = new Hono<AppEnv>()
searchRoutes.use('*', requireUser)

searchRoutes.get('/', async (c) => {
  const query = (c.req.query('q') ?? '').trim()
  if (query.length < 1) return c.json({ tasks: [] })
  return c.json({ tasks: await searchTasks(c.get('user').id, query) })
})
