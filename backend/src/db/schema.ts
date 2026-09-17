import { relations } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const memberRole = pgEnum('member_role', ['admin', 'member', 'viewer'])
export const memberStatus = pgEnum('member_status', ['active', 'pending'])
export const fileState = pgEnum('file_state', ['pending', 'ready'])
export const conversationKind = pgEnum('conversation_kind', ['dm', 'group'])

/**
 * A due date is a calendar day, not an instant. Bun's Postgres driver hands back
 * a JS Date for a `date` column, which drizzle's own string mode does not undo —
 * and a Date serialises as UTC midnight and reads as the previous day for anyone
 * west of London. This keeps it a 'YYYY-MM-DD' string on both sides.
 */
const calendarDate = customType<{ data: string; driverData: string | Date }>({
  dataType: () => 'date',
  fromDriver: (value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10),
  toDriver: (value) => value,
})

const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable(
  'users',
  {
    id: id(),
    // Always stored lower-cased (see normalizeEmail) so a plain unique index is
    // the whole story and every lookup can compare directly.
    email: text('email').notNull(),
    name: text('name').notNull(),
    initials: text('initials').notNull(),
    color: text('color').notNull(),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
)

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  prefix: text('prefix').notNull(),
  color: text('color').notNull().default('#171717'),
  description: text('description').notNull().default(''),
  logoKey: text('logo_key'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

// user_id is null while an invite is outstanding: an invited address may not
// have an account yet, and the row has to exist so the members list can show it.
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: memberRole('role').notNull().default('member'),
    status: memberStatus('status').notNull().default('active'),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('workspace_members_email_key').on(table.workspaceId, table.email),
    index('workspace_members_user_idx').on(table.userId),
  ],
)

export const statuses = pgTable(
  'statuses',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => [index('statuses_workspace_idx').on(table.workspaceId, table.position)],
)

export const labels = pgTable(
  'labels',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('labels_name_key').on(table.workspaceId, table.name)],
)

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Per-workspace sequence starting at 101. The display id (TSK-104) is this
    // plus the workspace prefix, derived on read so a prefix change renumbers
    // everything without touching a row.
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    statusId: uuid('status_id').references(() => statuses.id, { onDelete: 'set null' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: calendarDate('due_date'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tasks_number_key').on(table.workspaceId, table.number),
    index('tasks_status_idx').on(table.statusId),
    index('tasks_assignee_idx').on(table.assigneeId),
  ],
)

export const taskLabels = pgTable(
  'task_labels',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.labelId] })],
)

export const files = pgTable(
  'files',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    ext: text('ext').notNull(),
    size: integer('size').notNull().default(0),
    contentType: text('content_type').notNull().default('application/octet-stream'),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    // 'pending' until the browser's PUT to S3 succeeds. Reads ignore those, so a
    // failed upload never shows up as a file that cannot be opened.
    state: fileState('state').notNull().default('pending'),
    createdAt: createdAt(),
  },
  (table) => [index('files_task_idx').on(table.taskId), index('files_workspace_idx').on(table.workspaceId)],
)

export const comments = pgTable(
  'comments',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('comments_task_idx').on(table.taskId, table.createdAt)],
)

export const conversations = pgTable('conversations', {
  id: id(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  kind: conversationKind('kind').notNull().default('dm'),
  title: text('title'),
  createdAt: createdAt(),
})

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    muted: boolean('muted').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('conversation_members_user_idx').on(table.userId),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('messages_conversation_idx').on(table.conversationId, table.createdAt)],
)

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
}))

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  statuses: many(statuses),
  labels: many(labels),
  tasks: many(tasks),
  files: many(files),
}))

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [tasks.workspaceId], references: [workspaces.id] }),
  status: one(statuses, { fields: [tasks.statusId], references: [statuses.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  labels: many(taskLabels),
  files: many(files),
  comments: many(comments),
}))

export type User = typeof users.$inferSelect
export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type Status = typeof statuses.$inferSelect
export type Label = typeof labels.$inferSelect
export type Task = typeof tasks.$inferSelect
export type FileRow = typeof files.$inferSelect
export type Comment = typeof comments.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type Message = typeof messages.$inferSelect
export type MemberRole = (typeof memberRole.enumValues)[number]
