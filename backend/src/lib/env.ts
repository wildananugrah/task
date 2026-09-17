/**
 * One place that reads process.env, so a missing variable fails at boot with a
 * name rather than at 3am as an undefined deep inside a request.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

const bool = (name: string, fallback: boolean) => {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  return raw === 'true' || raw === '1'
}

const int = (name: string, fallback: number) => {
  const raw = process.env[name]
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:5173'

function parseEmailDomains(raw: string) {
  const domains = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  const malformed = domains.filter((domain) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
  if (malformed.length) {
    throw new Error(
      `GOOGLE_ALLOWED_DOMAINS must be bare email domains such as "mhamzah.id", not ${malformed
        .map((value) => JSON.stringify(value))
        .join(', ')}. As written, no address could match and every sign-in would be refused.`,
    )
  }
  return domains
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',

  databaseUrl: required(
    'DATABASE_URL',
    'postgres://taskspace:taskspace@localhost:5432/taskspace',
  ),

  apiPort: int('API_PORT', 3004),
  wsPort: int('WS_PORT', 3005),
  appOrigin,
  // Every origin allowed to send credentialed requests. Comma-separated so a
  // preview deployment can be added without a code change.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? appOrigin)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  publicWsUrl: process.env.PUBLIC_WS_URL ?? 'ws://localhost:3005/ws',

  sessionSecret: required('SESSION_SECRET', 'dev-session-secret-change-me'),
  wsTicketSecret: required('WS_TICKET_SECRET', 'dev-ws-ticket-secret-change-me'),
  sessionDays: int('SESSION_DAYS', 7),
  authDevMode: bool('AUTH_DEV_MODE', true),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3004/api/auth/google/callback',
    // Bare email domains only. A value with a scheme, a slash or an "@" is
    // someone having read this as an origin allow-list, and it would silently
    // refuse every sign-in — so it is rejected at boot instead of at 2am.
    allowedDomains: parseEmailDomains(process.env.GOOGLE_ALLOWED_DOMAINS ?? ''),
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: required('S3_BUCKET', 'taskspace'),
    accessKeyId: required('S3_ACCESS_KEY_ID', 'taskspace'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY', 'taskspace-secret'),
    forcePathStyle: bool('S3_FORCE_PATH_STYLE', true),
  },

  maxUploadBytes: int('MAX_UPLOAD_BYTES', 25 * 1024 * 1024),
  uploadUrlTtl: int('UPLOAD_URL_TTL', 300),
  downloadUrlTtl: int('DOWNLOAD_URL_TTL', 300),
}

/** Exported for the test that pins the shape this field accepts. */
export const parseEmailDomainsForTest = parseEmailDomains

export const googleEnabled = () => Boolean(env.google.clientId && env.google.clientSecret)
