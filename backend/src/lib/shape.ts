/**
 * Row → wire shapes. One module so every route answers with the same record and
 * the client never has to know which query produced it.
 */
import type {
  Comment,
  Conversation,
  FileRow,
  Label,
  Message,
  Status,
  Task,
  User,
  Workspace,
  WorkspaceMember,
} from '../db/schema'

export type PublicUser = ReturnType<typeof shapeUser>

export const shapeUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  initials: user.initials,
  color: user.color,
  avatarUrl: user.avatarUrl,
})

/** The display id the UI shows. Derived, so a prefix change renumbers for free. */
export const taskRef = (prefix: string, number: number) => `${prefix}-${number}`

export const shapeWorkspace = (
  workspace: Workspace,
  extra: { role?: string; logoUrl?: string | null } = {},
) => ({
  id: workspace.id,
  name: workspace.name,
  initials: workspace.initials,
  prefix: workspace.prefix,
  color: workspace.color,
  description: workspace.description,
  logoUrl: extra.logoUrl ?? null,
  archivedAt: workspace.archivedAt,
  role: extra.role ?? 'member',
})

export const shapeMember = (member: WorkspaceMember, user: User | null) => ({
  id: member.id,
  userId: member.userId,
  name: user?.name ?? member.email,
  email: member.email,
  initials: user?.initials ?? '??',
  color: user?.color ?? '#8c8c8c',
  avatarUrl: user?.avatarUrl ?? null,
  role: member.role,
  status: member.status,
})

export const shapeStatus = (status: Status) => ({
  id: status.id,
  name: status.name,
  color: status.color,
  position: status.position,
})

export const shapeLabel = (label: Label) => ({ id: label.id, name: label.name })

export const shapeTask = (
  task: Task,
  extra: {
    prefix: string
    labels?: string[]
    fileCount?: number
    commentCount?: number
  },
) => ({
  id: task.id,
  ref: taskRef(extra.prefix, task.number),
  number: task.number,
  workspaceId: task.workspaceId,
  title: task.title,
  description: task.description,
  statusId: task.statusId,
  assigneeId: task.assigneeId,
  dueDate: task.dueDate,
  labels: extra.labels ?? [],
  fileCount: extra.fileCount ?? 0,
  commentCount: extra.commentCount ?? 0,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
})

export const shapeFile = (
  file: FileRow,
  extra: { uploader?: User | null; taskRef?: string | null; taskTitle?: string | null } = {},
) => ({
  id: file.id,
  taskId: file.taskId,
  taskRef: extra.taskRef ?? null,
  taskTitle: extra.taskTitle ?? null,
  name: file.name,
  ext: file.ext,
  size: file.size,
  contentType: file.contentType,
  createdAt: file.createdAt,
  uploadedBy: extra.uploader ? shapeUser(extra.uploader) : null,
})

export const shapeComment = (comment: Comment, author: User | null) => ({
  id: comment.id,
  taskId: comment.taskId,
  body: comment.body,
  createdAt: comment.createdAt,
  author: author ? shapeUser(author) : null,
})

export const shapeMessage = (message: Message, author: User | null) => ({
  id: message.id,
  conversationId: message.conversationId,
  body: message.body,
  createdAt: message.createdAt,
  author: author ? shapeUser(author) : null,
})

export const shapeConversation = (
  conversation: Conversation,
  extra: {
    participants: PublicUser[]
    lastMessage?: ReturnType<typeof shapeMessage> | null
    unread?: number
    lastReadAt?: Date | null
  },
) => ({
  id: conversation.id,
  kind: conversation.kind,
  workspaceId: conversation.workspaceId,
  title: conversation.title,
  participants: extra.participants,
  lastMessage: extra.lastMessage ?? null,
  unread: extra.unread ?? 0,
  lastReadAt: extra.lastReadAt ?? null,
})
