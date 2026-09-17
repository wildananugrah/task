import { HTTPException } from 'hono/http-exception'

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'payload_too_large'
  | 'internal'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  internal: 500,
}

/** Every failure the client should be able to branch on goes through here. */
export function fail(code: ErrorCode, message: string, detail?: unknown): never {
  throw new HTTPException(STATUS[code] as 400, {
    res: Response.json({ error: { code, message, detail } }, { status: STATUS[code] }),
  })
}

// Function declarations, not arrows: TypeScript only narrows control flow after
// a never-returning call when the callee is a declaration or an explicitly
// annotated name. As arrows these compiled, but every caller then needed a
// redundant `return` after them.
export function badRequest(message: string, detail?: unknown): never {
  return fail('bad_request', message, detail)
}
export function unauthorized(message = 'Sign in to continue'): never {
  return fail('unauthorized', message)
}
export function forbidden(message = 'You do not have access to this'): never {
  return fail('forbidden', message)
}
export function notFound(message = 'Not found'): never {
  return fail('not_found', message)
}
export function conflict(message: string, detail?: unknown): never {
  return fail('conflict', message, detail)
}
