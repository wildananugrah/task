// Seed content for the prototype. Everything the app shows is generated here
// once at start-up and then lives in React state.

export const MEMBERS = [
  { id: 'iqbal', name: 'Iqbal', init: 'IQ', color: '#2f6f9f', email: 'iqbal@team.co', role: 'Admin' },
  { id: 'welby', name: 'Welby', init: 'WL', color: '#b4531f', email: 'welby@team.co', role: 'Admin' },
  { id: 'shauma', name: 'Shauma', init: 'SH', color: '#7a4a9c', email: 'shauma@team.co', role: 'Member' },
]

export const CURRENT_USER = MEMBERS[0]

export const ROLES = ['Admin', 'Member', 'Viewer']

export const ROLE_DESC = {
  Admin: 'Full access, including settings',
  Member: 'Create and edit tasks',
  Viewer: 'Read-only access',
}

export const ROLE_HINT = {
  Admin: 'Admins can change statuses, labels, members and workspace settings.',
  Member: 'Members can create and edit tasks, upload files and comment.',
  Viewer: 'Viewers can read tasks and comments but not edit them.',
}

export const PALETTE = [
  '#8c8c8c',
  '#2f6f9f',
  '#1f7a5a',
  '#8a6d1f',
  '#b4531f',
  '#a5342f',
  '#7a4a9c',
  '#3f4a8a',
  '#4a5d3a',
  '#171717',
]

export const LABELS = ['Docs', 'Bug', 'Design', 'Infra', 'Ops']

export const STATUSES = [
  { id: 'backlog', name: 'Backlog', color: '#8c8c8c' },
  { id: 'progress', name: 'In Progress', color: '#2f6f9f' },
  { id: 'review', name: 'Review', color: '#8a6d1f' },
  { id: 'blocked', name: 'Blocked', color: '#a5342f' },
  { id: 'done', name: 'Done', color: '#1f7a5a' },
]

export const WORKSPACES = [
  {
    id: 'work',
    name: 'Work workspace',
    init: 'WW',
    prefix: 'TSK',
    color: '#171717',
    desc: 'Day-to-day team tasks and delivery',
    role: 'Admin',
    people: [0, 1, 2],
  },
  {
    id: 'client',
    name: 'Client Delivery',
    init: 'CD',
    prefix: 'CLD',
    color: '#4a4a4a',
    desc: 'Scoped work for external accounts',
    role: 'Admin',
    people: [1, 2],
  },
  {
    id: 'ops',
    name: 'Internal Ops',
    init: 'IO',
    prefix: 'OPS',
    color: '#6e6e6e',
    desc: 'Hiring, finance and admin',
    role: 'Member',
    people: [0, 2],
  },
  {
    id: 'lab',
    name: 'Product Lab',
    init: 'PL',
    prefix: 'PRF',
    color: '#8c8c8c',
    desc: 'Experiments that are not committed yet',
    role: 'Viewer',
    people: [0, 1],
  },
]

const TITLES = [
  'Buat document TSD',
  'Review API contract pembayaran',
  'Fix login redirect loop',
  'Setup staging environment',
  'Update onboarding copy',
  'Migrasi database ke Postgres 16',
  'Audit dependency vulnerabilities',
  'Design empty states for task list',
  'Write release notes v1.4',
  'Refactor auth middleware',
  'Add file upload size limit',
  'Integrasi Slack notification',
  'QA regression checklist',
  'Buat wireframe workspace settings',
  'Optimize task list query',
  'Set up error monitoring',
  'Draft privacy policy update',
  'Remove legacy export endpoint',
  'Add keyboard shortcuts',
  'Buat template email invite',
  'Cleanup unused feature flags',
  'Weekly metrics dashboard',
  'Fix timezone bug on due dates',
  'Rate limit comment endpoint',
  'Improve search relevance',
  'Buat SOP handover project',
  'Add bulk status update',
  'Compress uploaded images',
  'Document deployment steps',
  'Review vendor contract',
  'Add mention notifications',
  'Fix drag ghost on board',
  'Sprint planning Q4',
  'Buat laporan bulanan tim',
  'Archive completed workspaces',
  'Add CSV import for tasks',
  'Test restore from backup',
  'Update brand colors in app',
  'Accessibility pass on forms',
  'Retro notes September',
]

const DESCS = [
  'Draft the technical solution document so engineering and QA work from the same spec. Cover data model, endpoints, and rollout steps.',
  'Check the request and response shapes against what the vendor documented, then note anything that would break our current client.',
  'Reproduce on a clean profile first. Likely the session cookie is being set before the redirect resolves.',
  'Mirror production config with smaller instances. Seed with anonymised data so the team can click around safely.',
]

const FILES = [
  { name: 'TSD-v3.pdf', ext: 'PDF', meta: '2.4 MB · Iqbal · Sep 11' },
  { name: 'flow-diagram.png', ext: 'PNG', meta: '812 KB · Shauma · Sep 10' },
  { name: 'api-contract.xlsx', ext: 'XLS', meta: '144 KB · Welby · Sep 9' },
  { name: 'notes.md', ext: 'MD', meta: '4 KB · Iqbal · Sep 12' },
]

const COMMENT_TEXT = [
  'Draft is up in the files — @Welby can you check section 4?',
  'Blocked until /TSK-104 lands, then I will pick this back up.',
  'Updated the copy. Kept it short as discussed.',
  'Looks good. One nit: the status names should match /TSK-101.',
  'Moving this to Review, nothing else pending from my side.',
]

// Hand-tuned so each workspace reads like a real board rather than a rotation.
const STATUS_SEQUENCE = [
  1, 0, 2, 0, 4, 3, 0, 1, 4, 2, 0, 1, 3, 0, 1, 4, 0, 2, 1, 0, 4, 1, 3, 0, 2, 1, 0, 4, 2, 0, 1, 3, 1,
  0, 4, 0, 2, 1, 0, 4,
]

const DUE_DATES = ['Sep 15', 'Sep 18', 'Sep 22', 'Sep 26', 'Oct 2', 'Oct 9', '—']

const COMMENT_WHEN = ['2h ago', 'yesterday', 'Sep 10']

function seedWorkspace(wsId, prefix, titles, offset) {
  return titles.map((title, i) => {
    const k = i + offset
    const status = STATUSES[STATUS_SEQUENCE[k % 40] || 0]
    const fileCount = k % 4 === 0 ? 3 : k % 3 === 0 ? 1 : 0
    const commentCount = k % 5 === 0 ? 3 : k % 2 === 0 ? 1 : 0

    return {
      ws: wsId,
      num: 101 + i,
      id: `${prefix}-${101 + i}`,
      title,
      status: status.id,
      assignee: MEMBERS[k % 3].id,
      labels: k % 3 === 0 ? [LABELS[k % 5]] : k % 7 === 0 ? [LABELS[k % 5], 'Ops'] : [],
      desc: DESCS[k % DESCS.length],
      due: DUE_DATES[k % 7],
      overdue: k % 11 === 0,
      files: FILES.slice(0, fileCount).map((file) => ({ ...file })),
      comments: COMMENT_TEXT.slice(0, commentCount).map((text, j) => {
        const member = MEMBERS[(k + j) % 3]
        return {
          who: member.name,
          init: member.init,
          color: member.color,
          when: COMMENT_WHEN[j % 3],
          text,
        }
      }),
    }
  })
}

export function seedTasks() {
  return [
    ...seedWorkspace('work', 'TSK', TITLES, 0),
    ...seedWorkspace('client', 'CLD', TITLES.slice(1, 13), 3),
    ...seedWorkspace('ops', 'OPS', TITLES.slice(16, 25), 5),
    ...seedWorkspace('lab', 'PRF', TITLES.slice(26, 33), 2),
  ]
}

export const THREADS = [
  { id: 'welby', unread: true, when: '2m', preview: 'Can you look at /TSK-104 before standup?' },
  { id: 'shauma', unread: true, when: '18m', preview: 'Sent the wireframes, @Iqbal' },
  { id: 'iqbal2', unread: false, when: '1h', preview: 'You: moved it to Review' },
  { id: 'group', unread: true, when: '3h', preview: 'Welby: retro moved to Friday' },
]

export const CONVERSATIONS = {
  welby: [
    { me: false, text: 'Can you look at /TSK-104 before standup?' },
    { me: true, text: 'Yes, reading it now. The staging box is up.' },
    { me: false, text: 'Nice. @Shauma also needs the diagram from there.' },
  ],
  shauma: [
    { me: false, text: 'Sent the wireframes, @Iqbal' },
    { me: true, text: 'Got them. Attaching to /TSK-114 so they do not get lost.' },
  ],
  iqbal2: [{ me: true, text: 'Moved /TSK-109 to Review.' }],
  group: [
    { me: false, text: 'Retro moved to Friday 4pm.' },
    { me: true, text: 'Works. I will bring notes from /TSK-140.' },
  ],
}

// Each thread renders under a display identity that is not always its member id.
export const THREAD_IDENTITY = {
  welby: { memberId: 'welby', name: 'Welby', presence: 'Active now' },
  shauma: { memberId: 'shauma', name: 'Shauma', presence: 'Active now' },
  iqbal2: { memberId: 'shauma', name: 'Shauma', presence: 'Active now' },
  group: {
    memberId: 'welby',
    name: 'Work workspace · 3',
    presence: '3 members',
    init: 'WW',
    color: '#1f7a5a',
  },
}

export const FILE_PREVIEW_ROWS = [
  ['Milestone', 'Owner', 'Due', 'Status'],
  ['Discovery', 'Iqbal', 'Sep 12', 'Done'],
  ['TSD sign-off', 'Welby', 'Sep 18', 'In review'],
  ['Build', 'Shauma', 'Oct 02', 'Not started'],
  ['UAT', 'Iqbal', 'Oct 09', 'Not started'],
]

export const FILE_PREVIEW_LINES = ['1. Scope', '2. Data model', '3. Endpoints', '4. Rollout', '']
