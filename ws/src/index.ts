/**
 * Taskspace chat socket.
 *
 * A separate process from the API on purpose: restarting the API during a
 * deploy should not drop everybody's conversation, and a socket holding
 * thousands of idle connections has a different shape of load than a request
 * handler. It shares the API's Drizzle schema and chat module by import, so
 * there is exactly one definition of what a message is and who may send one.
 *
 * Fan-out is per person, not per conversation: every socket subscribes to
 * `user:<id>` and nothing else. Publishing to a conversation topic instead
 * delivered twice to anyone who was also reachable by name, and left a socket
 * deaf to a DM opened after it connected. One topic per person has neither
 * problem, and a chat conversation is small enough that a handful of publishes
 * costs nothing.
 */
import type { ServerWebSocket } from 'bun'
import { env } from '../../backend/src/lib/env'
import { verifyJwt } from '../../backend/src/lib/jwt'
import { sql } from '../../backend/src/db/client'
import {
  conversationAudience,
  conversationPeers,
  isConversationMember,
  markRead,
  memberConversationIds,
  postMessage,
} from '../../backend/src/lib/chat'
import { Presence } from './presence'

type SocketData = {
  userId: string
  /** Cached so a keystroke's typing frame is not a database round-trip. */
  conversationIds: string[]
  connectedAt: number
}

type Socket = ServerWebSocket<SocketData>

const presence = new Presence()
const topicForUser = (userId: string) => `user:${userId}`

const send = (ws: Socket, payload: unknown) => {
  ws.send(JSON.stringify(payload))
}

// Declared before the handlers that publish through it: they run long after
// Bun.serve() returns, and close over the binding rather than its value.
let server: Bun.Server<SocketData>
const publish = (topic: string, payload: unknown) => {
  server.publish(topic, JSON.stringify(payload))
}

server = Bun.serve<SocketData, never>({
  port: env.wsPort,

  async fetch(request, srv) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'taskspace-ws', online: presence.online().length })
    }
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 })

    // The session cookie does not travel to this port, so the client trades it
    // at the API for a 60-second ticket. Short-lived and single-purpose: a
    // ticket caught in a proxy log is worthless a minute later.
    const ticket = url.searchParams.get('ticket')
    const claims = await verifyJwt<{ sub: string; aud: string }>(ticket, env.wsTicketSecret)
    if (!claims?.sub || claims.aud !== 'ws') return new Response('Unauthorized', { status: 401 })

    const conversationIds = await memberConversationIds(claims.sub)
    const upgraded = srv.upgrade(request, {
      data: { userId: claims.sub, conversationIds, connectedAt: Date.now() },
    })
    return upgraded ? undefined : new Response('Expected a WebSocket upgrade', { status: 400 })
  },

  websocket: {
    idleTimeout: 120,
    // Keeps a chat socket — idle by nature between messages — alive through
    // proxies that cut quiet connections.
    sendPings: true,

    async open(ws: Socket) {
      ws.subscribe(topicForUser(ws.data.userId))
      send(ws, {
        t: 'ready',
        userId: ws.data.userId,
        conversations: ws.data.conversationIds,
        online: presence.online(),
      })
      if (presence.add(ws.data.userId)) await announcePresence(ws.data.userId, true)
    },

    async message(ws: Socket, raw): Promise<void> {
      let payload: { t?: string; conversationId?: string; body?: string; clientId?: string }
      try {
        payload = JSON.parse(String(raw))
      } catch {
        send(ws, { t: 'error', code: 'bad_json', reason: 'Could not read that frame' })
        return
      }

      switch (payload.t) {
        case 'ping':
          send(ws, { t: 'pong' })
          return

        case 'send':
          await handleSend(ws, payload)
          return

        case 'typing': {
          const { conversationId } = payload
          if (!conversationId || !ws.data.conversationIds.includes(conversationId)) return
          for (const peer of await conversationAudience(conversationId)) {
            if (peer === ws.data.userId) continue
            publish(topicForUser(peer), { t: 'typing', conversationId, userId: ws.data.userId })
          }
          return
        }

        case 'read': {
          const { conversationId } = payload
          if (!conversationId) return
          if (!(await isConversationMember(conversationId, ws.data.userId))) return
          const at = await markRead(conversationId, ws.data.userId)
          send(ws, { t: 'read', conversationId, at })
          return
        }

        case 'refresh': {
          // After a reconnect, or once a conversation has been created, the
          // client relearns its rooms without dropping the socket.
          const ids = await memberConversationIds(ws.data.userId)
          ws.data.conversationIds = ids
          send(ws, {
            t: 'ready',
            userId: ws.data.userId,
            conversations: ids,
            online: presence.online(),
          })
          return
        }

        default:
          send(ws, { t: 'error', code: 'unknown_type', reason: `Unknown frame ${payload.t}` })
      }
    },

    close(ws: Socket) {
      if (presence.remove(ws.data.userId)) void announcePresence(ws.data.userId, false)
    },
  },
})

async function handleSend(
  ws: Socket,
  payload: { conversationId?: string; body?: string; clientId?: string },
): Promise<void> {
  const { conversationId, body, clientId } = payload

  if (!conversationId || !body?.trim()) {
    send(ws, { t: 'error', code: 'bad_request', reason: 'A message needs text', clientId })
    return
  }

  // Membership is re-checked on every send rather than trusted from the
  // handshake: someone removed from a workspace mid-session has to stop being
  // able to post to its room immediately, not at their next reconnect.
  if (!(await isConversationMember(conversationId, ws.data.userId))) {
    send(ws, { t: 'error', code: 'forbidden', reason: 'You are not in that conversation', clientId })
    return
  }

  let message
  try {
    message = await postMessage(conversationId, ws.data.userId, body)
  } catch (error) {
    const code = (error as Error).message
    // `reason`, not `message`: on a message frame `message` is the message
    // itself, and one field meaning two things is how a client ends up
    // rendering an error as a chat bubble.
    send(ws, {
      t: 'error',
      code,
      reason: code === 'message_too_long' ? 'That message is too long' : 'Could not send that',
      clientId,
    })
    return
  }

  // clientId rides back so the sender reconciles the bubble it already drew
  // rather than rendering the same message twice.
  for (const member of await conversationAudience(conversationId)) {
    publish(topicForUser(member), {
      t: 'message',
      message,
      clientId: member === ws.data.userId ? clientId : undefined,
    })
  }

  if (!ws.data.conversationIds.includes(conversationId)) {
    ws.data.conversationIds = [...ws.data.conversationIds, conversationId]
  }
}

/**
 * One frame per person who can see this one. Announcing on each shared
 * conversation instead sent the same "online" five times to a colleague who
 * happened to be in five of the same rooms.
 */
async function announcePresence(userId: string, online: boolean) {
  for (const peer of await conversationPeers(userId)) {
    publish(topicForUser(peer), { t: 'presence', userId, online })
  }
}

console.log(`taskspace-ws listening on ws://localhost:${server.port}/ws`)

process.on('SIGINT', async () => {
  await sql.close()
  process.exit(0)
})
