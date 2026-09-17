import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { db } from '../src/db/client'
import {
  conversationAudience,
  conversationPeers,
  ensureDirectConversation,
  isConversationMember,
  listConversations,
  markRead,
  postMessage,
} from '../src/lib/chat'
import { makeUser, scenario } from './helpers'

describe('conversations', () => {
  test('a workspace team room includes its members', async () => {
    const { room, admin, member } = await scenario()
    expect(await isConversationMember(room.id, admin.user.id)).toBe(true)
    expect(await isConversationMember(room.id, member.user.id)).toBe(true)

    const outsider = await makeUser()
    expect(await isConversationMember(room.id, outsider.id)).toBe(false)
  })

  test('two people only ever have one DM', async () => {
    const a = await makeUser()
    const b = await makeUser()

    const first = await ensureDirectConversation(a.id, b.id)
    const second = await ensureDirectConversation(a.id, b.id)
    const reversed = await ensureDirectConversation(b.id, a.id)

    expect(second).toBe(first)
    expect(reversed).toBe(first)
  })

  test('a DM with yourself is refused', async () => {
    const a = await makeUser()
    expect(ensureDirectConversation(a.id, a.id)).rejects.toThrow('cannot_dm_self')
  })

  test('a DM is named after the other person', async () => {
    const { admin } = await scenario()
    const other = await makeUser('somebody@test.co')
    const id = await ensureDirectConversation(admin.user.id, other.id)

    const mine = await listConversations(admin.user.id)
    const dm = mine.find((conversation) => conversation.id === id)
    expect(dm?.title).toBe(other.name)

    const theirs = await listConversations(other.id)
    expect(theirs.find((conversation) => conversation.id === id)?.title).toBe(admin.user.name)
  })
})

describe('messages', () => {
  test('empty and oversized messages are refused', async () => {
    const { room, admin } = await scenario()
    expect(postMessage(room.id, admin.user.id, '   ')).rejects.toThrow('empty_message')
    expect(postMessage(room.id, admin.user.id, 'x'.repeat(4001))).rejects.toThrow('message_too_long')
  })

  test('unread counts someone else, never yourself', async () => {
    const { room, admin, member } = await scenario()

    await postMessage(room.id, admin.user.id, 'from the admin')
    await postMessage(room.id, admin.user.id, 'and again')

    const forAdmin = (await listConversations(admin.user.id)).find((c) => c.id === room.id)
    const forMember = (await listConversations(member.user.id)).find((c) => c.id === room.id)

    // Sending is reading: your own message must not come back as unread.
    expect(forAdmin?.unread).toBe(0)
    expect(forMember?.unread).toBe(2)
    expect(forMember?.lastMessage?.body).toBe('and again')
  })

  test('marking read clears it, and a later message starts a new count', async () => {
    const { room, admin, member } = await scenario()
    await postMessage(room.id, admin.user.id, 'one')
    await markRead(room.id, member.user.id)

    let forMember = (await listConversations(member.user.id)).find((c) => c.id === room.id)
    expect(forMember?.unread).toBe(0)

    await Bun.sleep(10)
    await postMessage(room.id, admin.user.id, 'two')
    forMember = (await listConversations(member.user.id)).find((c) => c.id === room.id)
    expect(forMember?.unread).toBe(1)
  })

  test('conversations are ordered by their most recent message', async () => {
    const { room, admin } = await scenario()
    const other = await makeUser()
    const dm = await ensureDirectConversation(admin.user.id, other.id)

    await postMessage(room.id, admin.user.id, 'in the room')
    await Bun.sleep(10)
    await postMessage(dm, other.id, 'in the dm')

    const mine = await listConversations(admin.user.id)
    expect(mine[0]?.id).toBe(dm)
  })
})

describe('socket fan-out', () => {
  test('the audience of a message is everyone in the conversation', async () => {
    const { room, admin, member, viewer } = await scenario()
    const audience = await conversationAudience(room.id)
    expect(audience.sort()).toEqual([admin.user.id, member.user.id, viewer.user.id].sort())
  })

  /**
   * Presence is announced once per person, not once per shared conversation —
   * two people in five rooms together should see one "online", not five.
   */
  test('peers are listed once however many conversations are shared', async () => {
    const { admin, member } = await scenario()
    await ensureDirectConversation(admin.user.id, member.user.id)

    const peers = await conversationPeers(admin.user.id)
    expect(peers.filter((id) => id === member.user.id)).toHaveLength(1)
    expect(peers).not.toContain(admin.user.id)
  })
})

describe('read state uses one clock', () => {
  /**
   * Unread is `messages.created_at > last_read_at`. created_at is written by
   * Postgres, so last_read_at must be too — a timestamp from the API process
   * makes two clocks decide whether something has been read, and a few
   * milliseconds of drift either hides a new message or strands an old one.
   */
  test('markRead returns a database timestamp, not a process one', async () => {
    const { room, admin, member } = await scenario()
    await postMessage(room.id, admin.user.id, 'before')

    const at = await markRead(room.id, member.user.id)
    const [{ now }] = await db.execute<{ now: Date }>(sql`select now() as now`)

    // Within a second of the database's own clock, whatever this process thinks.
    expect(Math.abs(new Date(at).getTime() - new Date(now).getTime())).toBeLessThan(1000)

    // And the message that came before it is read, with no sleep anywhere.
    const after = (await listConversations(member.user.id)).find((c) => c.id === room.id)
    expect(after?.unread).toBe(0)
  })
})
