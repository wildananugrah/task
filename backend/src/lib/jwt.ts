/**
 * Minimal HS256 sign/verify on Web Crypto. Sessions and socket tickets are the
 * only two things signed here, both short and both ours, so a JWT library would
 * be a dependency carrying nothing we use.
 */

const encoder = new TextEncoder()

const b64url = (bytes: Uint8Array | ArrayBuffer) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

const unb64url = (value: string) =>
  new Uint8Array(Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64'))

const keyFor = (secret: string) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])

export type JwtPayload = Record<string, unknown> & { exp?: number; iat?: number }

export async function signJwt(payload: JwtPayload, secret: string, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + ttlSeconds }
  const head = b64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const claims = b64url(encoder.encode(JSON.stringify(body)))
  const data = `${head}.${claims}`
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret), encoder.encode(data))
  return `${data}.${b64url(signature)}`
}

export async function verifyJwt<T extends JwtPayload>(
  token: string | undefined | null,
  secret: string,
): Promise<T | null> {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [head, claims, signature] = parts as [string, string, string]
  const valid = await crypto.subtle.verify(
    'HMAC',
    await keyFor(secret),
    unb64url(signature),
    encoder.encode(`${head}.${claims}`),
  )
  if (!valid) return null

  try {
    const payload = JSON.parse(Buffer.from(unb64url(claims)).toString('utf8')) as T
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
