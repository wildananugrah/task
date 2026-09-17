# Taskspace

Team task workspace. Vite + React + Tailwind CSS v4, UI only — all data is mock
data in `src/data/mock.js` and no network calls are made.

```bash
npm install
npm run dev
```

## Structure

| Path | Purpose |
| --- | --- |
| `src/data/mock.js` | Tasks, projects, people, activity. The single source for everything on screen. |
| `src/lib/helpers.js` | Lookups, due-date labels, status colours. |
| `src/components/CapacityBar.jsx` | The day's committed hours against capacity, segmented per task. |
| `src/components/Board.jsx` | Five-column board with drag-and-drop between columns. |
| `src/components/ListView.jsx` | Same tasks as a sortable-width table. |
| `src/components/TaskDetail.jsx` | Side panel: details, status move, checklist. |
| `src/index.css` | Design tokens under Tailwind v4 `@theme`. |

## What works

Filter by project, search, "assigned to me", board/list toggle, drag a card
between columns, open a task, move it by status button, tick checklist items.
State is React state — a reload resets it.

## Design notes

Colour carries information rather than decoration: the left rail on a card is
its status, project dots use a fixed four-hue set, and the capacity bar is the
one deliberately loud element. Tokens live in `src/index.css`; changing
`--color-ultra` or the `--color-proj-*` values re-themes the app.
