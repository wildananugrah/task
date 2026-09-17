import { Hono } from 'hono'
import { z } from 'zod'
import {
  conversationMessages,
  ensureDirectConversation,
  isConversationMember,
  listConversations,
  markRead,
  postMessage,
} from '../lib/chat'
import { badRequest, forbidden, notFound } from '../lib/errors'
import { parse } from '../lib/validate'
import { requireUser, type AppEnv } from '../middleware/session'

export const conversationRoutes = new Hono<AppEnv>()
conversationRoutes.use('*', requireUser)

conversationRoutes.get('/', async (c) =>
  c.json({ conversations: await listConversations(c.get('user').id) }),
)

/** Start (or find) the DM with someone. Two people only ever have one. */
conversationRoutes.post('/dm', async (c) => {
  const user = c.get('user')
  const { userId } = parse(
    z.object({ userId: z.uuid() }),
    await c.req.json().catch(() => ({})),
  )
  if (userId === user.id) badRequest('You cannot message yourself')

  const id = await ensureDirectConversation(user.id, userId)
  const conversations = await listConversations(user.id)
  return c.json({
    conversationId: id,
    conversation: conversations.find((conversation) => conversation.id === id) ?? null,
  })
})

conversationRoutes.get('/:id/messages', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!(await isConversationMember(id, user.id))) notFound('Conversation not found')

  const limit = Math.min(Number(c.req.query('limit') ?? 100) || 100, 200)
  return c.json({ messages: await conversationMessages(id, limit) })
})

/**
 * The same write the socket performs, over HTTP. It exists so a dropped socket
 * degrades to a slower chat rather than a broken one.
 */
conversationRoutes.post('/:id/messages', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!(await isConversationMember(id, user.id))) forbidden('You are not in that conversation')

  const { body } = parse(
    z.object({ body: z.string().trim().min(1).max(4000) }),
    await c.req.json().catch(() => ({})),
  )

  return c.json({ message: await postMessage(id, user.id, body) }, 201)
})

conversationRoutes.post('/:id/read', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!(await isConversationMember(id, user.id))) notFound('Conversation not found')
  return c.json({ at: await markRead(id, user.id) })
})
