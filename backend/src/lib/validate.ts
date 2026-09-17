import type { ZodType } from 'zod'
import { badRequest } from './errors'

/**
 * One parse helper so a bad body always comes back as the same 400 shape with
 * the offending field named, rather than as a 500 from somewhere downstream.
 */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data

  const first = result.error.issues[0]
  const field = first?.path.join('.')
  badRequest(
    first?.message ?? 'That request was not valid',
    result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  )
  throw new Error(`unreachable ${field}`)
}
