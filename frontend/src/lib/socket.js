/**
 * Chat socket client. The durable copy of every message is in Postgres, so this
 * is only a delivery path: it reconnects with backoff, and the store refetches
 * the thread on reconnect rather than trying to replay what it missed.
 */
import { api } from './api'

const BACKOFF = [1000, 2000, 4000, 8000, 15000]

export function createSocket({ onFrame, onStatus }) {
  let socket = null
  let attempt = 0
  let closedByUs = false
  let retryTimer = null

  const status = (value) => onStatus?.(value)

  async function connect() {
    if (closedByUs) return
    clearTimeout(retryTimer)

    let ticket
    let url
    try {
      const response = await api.wsTicket()
      ticket = response.ticket
      url = response.url
    } catch {
      return retry()
    }

    status('connecting')
    socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`)

    socket.addEventListener('open', () => {
      attempt = 0
      status('online')
    })

    socket.addEventListener('message', (event) => {
      try {
        onFrame(JSON.parse(event.data))
      } catch {
        // A frame we cannot parse is not worth tearing the socket down for.
      }
    })

    socket.addEventListener('close', () => {
      socket = null
      if (closedByUs) return
      status('offline')
      retry()
    })

    // 'error' is always followed by 'close', which is where the retry lives.
    socket.addEventListener('error', () => status('offline'))
  }

  function retry() {
    if (closedByUs) return
    const wait = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
    attempt += 1
    retryTimer = setTimeout(connect, wait)
  }

  connect()

  return {
    send(frame) {
      if (socket?.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify(frame))
      return true
    },
    close() {
      closedByUs = true
      clearTimeout(retryTimer)
      socket?.close()
      socket = null
    },
  }
}
