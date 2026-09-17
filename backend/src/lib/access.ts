import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client'
import { workspaceMembers, workspaces, type MemberRole, type Workspace } from '../db/schema'
import { forbidden, notFound } from './errors'

/**
 * Role is checked here and only here. The UI hides what a viewer cannot do, but
 * hiding a button is presentation — this is the rule.
 */
const RANK: Record<MemberRole, number> = { viewer: 0, member: 1, admin: 2 }

export type Access = {
  workspace: Workspace
  role: MemberRole
  membershipId: string
  can: (level: MemberRole) => boolean
}

export async function loadAccess(
  workspaceId: string,
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Access> {
  const [row] = await db
    .select({ workspace: workspaces, member: workspaceMembers })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'active'),
      ),
    )
    .where(
      options.includeArchived
        ? eq(workspaces.id, workspaceId)
        : and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)),
    )
    .limit(1)

  // A workspace you are not a member of is indistinguishable from one that does
  // not exist — membership is not something an outsider gets to probe for.
  if (!row) notFound('Workspace not found')

  const role = row.member.role
  return {
    workspace: row.workspace,
    role,
    membershipId: row.member.id,
    can: (level) => RANK[role] >= RANK[level],
  }
}

export async function requireAccess(
  workspaceId: string,
  userId: string,
  level: MemberRole,
  options: { includeArchived?: boolean } = {},
) {
  const access = await loadAccess(workspaceId, userId, options)
  if (!access.can(level)) {
    forbidden(
      level === 'admin'
        ? 'Only an admin can change workspace settings'
        : 'Viewers have read-only access to this workspace',
    )
  }
  return access
}
