/**
 * Chat lives here rather than in a route file because two processes need it:
 * the API serves the history and the HTTP fallback, and the socket in `ws/`
 * writes the messages it receives. One copy of the rules, two callers.
 */
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { conversationMembers, conversations, messages, users, workspaces } from '../db/schema'
import { shapeConversation, shapeMessage, shapeUser } from './shape'

export async function memberConversationIds(userId: string) {
  const rows = await db
    .select({ id: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))
  return rows.map((row) => row.id)
}

export async function isConversationMember(conversationId: string, userId: string) {
  const [row] = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

export async function listConversations(userId: string) {
  const mine = await db
    .select({ conversation: conversations, lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, userId))

  if (!mine.length) return []
  const ids = mine.map((row) => row.conversation.id)

  const [participantRows, lastRows, unreadRows, workspaceRows] = await Promise.all([
    db
      .select({ conversationId: conversationMembers.conversationId, user: users })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(inArray(conversationMembers.conversationId, ids)),
    // The newest message per conversation, picked in the database rather than by
    // fetching every message and sorting in memory.
    db.execute<{
      conversation_id: string
      id: string
      body: string
      created_at: Date
      author_id: string | null
    }>(sql`
      select distinct on (conversation_id)
             conversation_id, id, body, created_at, author_id
        from messages
       where conversation_id in ${ids}
       order by conversation_id, created_at desc
    `),
    db
      .select({
        conversationId: messages.conversationId,
        total: sql<number>`count(*)::int`,
      })
      .from(messages)
      .innerJoin(
        conversationMembers,
        and(
          eq(conversationMembers.conversationId, messages.conversationId),
          eq(conversationMembers.userId, userId),
        ),
      )
      .where(
        and(
          inArray(messages.conversationId, ids),
          ne(messages.authorId, userId),
          sql`(${conversationMembers.lastReadAt} is null or ${messages.createdAt} > ${conversationMembers.lastReadAt})`,
        ),
      )
      .groupBy(messages.conversationId),
    db.select().from(workspaces),
  ])

  const workspaceName = new Map(workspaceRows.map((row) => [row.id, row.name]))
  const unread = new Map(unreadRows.map((row) => [row.conversationId, Number(row.total)]))
  const byId = new Map(participantRows.map((row) => [row.user.id, row.user]))

  const shaped = mine.map((row) => {
    const participants = participantRows
      .filter((participant) => participant.conversationId === row.conversation.id)
      .map((participant) => shapeUser(participant.user))

    const last = lastRows.find((message) => message.conversation_id === row.conversation.id)
    const author = last?.author_id ? byId.get(last.author_id) : null

    // A DM has no stored title — it is named after whoever else is in it.
    const other = participants.find((participant) => participant.id !== userId)
    const title =
      row.conversation.title ??
      (row.conversation.kind === 'dm'
        ? (other?.name ?? 'Conversation')
        : (workspaceName.get(row.conversation.workspaceId ?? '') ?? 'Team'))

    return {
      ...shapeConversation(row.conversation, {
        participants,
        lastMessage: last
          ? {
              id: last.id,
              conversationId: last.conversation_id,
              body: last.body,
              createdAt: last.created_at,
              author: author ? shapeUser(author) : null,
            }
          : null,
        unread: unread.get(row.conversation.id) ?? 0,
        lastReadAt: row.lastReadAt,
      }),
      title,
    }
  })

  return shaped.sort((a, b) => {
    const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0
    const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0
    return bt - at
  })
}

export async function conversationMessages(conversationId: string, limit = 100) {
  const rows = await db
    .select({ message: messages, author: users })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)

  return rows.reverse().map((row) => shapeMessage(row.message, row.author))
}

export async function postMessage(conversationId: string, userId: string, body: string) {
  const text = body.trim()
  if (!text) throw new Error('empty_message')
  if (text.length > 4000) throw new Error('message_too_long')

  const [row] = await db
    .insert(messages)
    .values({ conversationId, authorId: userId, body: text })
    .returning()

  const [author] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  // Sending is reading: the sender's own message must not come back as unread.
  await db
    .update(conversationMembers)
    .set({ lastReadAt: row!.createdAt })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )

  return shapeMessage(row!, author ?? null)
}

export async function markRead(conversationId: string, userId: string) {
  const now = new Date()
  await db
    .update(conversationMembers)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
  return now
}

/** Find-or-create the one DM between two people. */
export async function ensureDirectConversation(userId: string, otherUserId: string) {
  if (userId === otherUserId) throw new Error('cannot_dm_self')

  const [existing] = await db.execute<{ id: string }>(sql`
    select c.id
      from conversations c
      join conversation_members a on a.conversation_id = c.id and a.user_id = ${userId}::uuid
      join conversation_members b on b.conversation_id = c.id and b.user_id = ${otherUserId}::uuid
     where c.kind = 'dm'
     limit 1
  `)
  if (existing) return existing.id

  return db.transaction(async (tx) => {
    const [conversation] = await tx.insert(conversations).values({ kind: 'dm' }).returning()
    await tx.insert(conversationMembers).values([
      { conversationId: conversation!.id, userId },
      { conversationId: conversation!.id, userId: otherUserId },
    ])
    return conversation!.id
  })
}

/**
 * Everyone who shares at least one conversation with this person, each listed
 * once. Presence is announced per peer rather than per conversation — two people
 * in five rooms together should see one "online", not five.
 */
export async function conversationPeers(userId: string) {
  const rows = await db.execute<{ user_id: string }>(sql`
    select distinct peer.user_id
      from conversation_members mine
      join conversation_members peer on peer.conversation_id = mine.conversation_id
     where mine.user_id = ${userId}::uuid
       and peer.user_id <> ${userId}::uuid
  `)
  return rows.map((row) => row.user_id)
}

/** Who else should be told about a message, for socket fan-out. */
export async function conversationAudience(conversationId: string) {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
  return rows.map((row) => row.userId)
}

export async function unreadSince(conversationId: string, userId: string, since: Date | null) {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        ne(messages.authorId, userId),
        since ? gt(messages.createdAt, since) : sql`true`,
      ),
    )
  return Number(row?.total ?? 0)
}

export { asc }
