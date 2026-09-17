import { useEffect, useRef, useState } from 'react'
import { hasActiveFilter, statusCounts } from '../lib/select'
import { useApp } from '../state/useApp'
import SearchField from './ui/SearchField'

function FilterChip({ filter, open, onToggle, query, onQuery, onPick }) {
  const active = filter.value !== null && filter.value !== undefined
  const current = filter.options.find((option) => option.value === filter.value)
  const needle = query.trim().toLowerCase()

  const options = filter.searchable
    ? filter.options.filter((option) =>
        `${option.label} ${option.sub || ''}`.toLowerCase().includes(needle),
      )
    : filter.options

  return (
    <span className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          borderColor: active ? '#1f1f1f' : 'rgba(23,23,23,.14)',
          background: active ? '#1f1f1f' : '#fff',
          color: active ? '#fff' : 'rgba(23,23,23,.7)',
        }}
        className="flex cursor-pointer items-center gap-[7px] rounded-[20px] border px-[11px] py-[7px] text-xs leading-none font-medium"
      >
        {active && current?.dot && (
          <span
            aria-hidden="true"
            style={{ background: current.dot }}
            className="size-[7px] rounded-full"
          />
        )}
        {active && current ? current.label : filter.label}
        <span
          aria-hidden="true"
          className="text-[10px]"
          style={{ color: active ? 'rgba(255,255,255,.6)' : 'rgba(23,23,23,.4)' }}
        >
          ⌄
        </span>
      </button>

      {open && (
        <div className="absolute top-[38px] left-0 z-30 w-[238px] overflow-hidden rounded-[10px] border border-ink/12 bg-panel shadow-[0_12px_30px_rgba(23,23,23,.18)]">
          {filter.searchable && (
            <div className="flex items-center gap-[7px] border-b border-ink/8 bg-subtle px-[11px] py-[9px]">
              <span aria-hidden="true" className="text-[11px] text-ink/40">
                ⌕
              </span>
              <input
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                placeholder={`Search ${filter.label.toLowerCase()}`}
                aria-label={`Search ${filter.label.toLowerCase()}`}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-[12.5px] leading-none outline-none"
              />
            </div>
          )}

          <div className="max-h-[238px] overflow-y-auto">
            {options.map((option) => {
              const selected = option.value === filter.value
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => onPick(filter.key, selected ? null : option.value)}
                  className={`flex w-full cursor-pointer items-center gap-[9px] border-b border-b-ink/6 px-3 py-[9px] text-left hover:bg-canvas ${
                    selected ? 'bg-canvas' : 'bg-transparent'
                  }`}
                >
                  {option.dot && (
                    <span
                      aria-hidden="true"
                      style={{ background: option.dot }}
                      className="size-2 flex-none rounded-full"
                    />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[12.5px] leading-[1.2] font-medium">
                      {option.label}
                    </span>
                    {option.sub && (
                      <span className="truncate font-mono text-[10.5px] leading-none text-ink/45">
                        {option.sub}
                      </span>
                    )}
                  </span>
                  <span className="w-3 flex-none text-xs leading-none font-semibold">
                    {selected ? '✓' : ''}
                  </span>
                </button>
              )
            })}

            {options.length === 0 && (
              <div className="px-3 py-[18px] text-center text-[12.5px] leading-[1.4] text-ink/50">
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  )
}

export default function FilterBar() {
  const { state, actions } = useApp()
  const [openFilter, setOpenFilter] = useState(null)
  const [query, setQuery] = useState('')
  const barRef = useRef(null)

  useEffect(() => {
    if (!openFilter) return undefined
    const onDown = (event) => {
      if (!barRef.current?.contains(event.target)) setOpenFilter(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openFilter])

  const counts = statusCounts(state)

  const filters = [
    {
      key: 'statusFilter',
      label: 'Status',
      value: state.statusFilter,
      options: state.statuses.map((status) => ({
        label: status.name,
        value: status.id,
        dot: status.color,
        sub: `${counts[status.id] || 0} tasks`,
      })),
    },
    {
      key: 'assigneeFilter',
      label: 'Assignee',
      value: state.assigneeFilter,
      searchable: true,
      options: state.members
        .filter((member) => member.userId)
        .map((member) => ({
          label: member.name,
          value: member.userId,
          dot: member.color,
          sub: member.email,
        })),
    },
    {
      key: 'labelFilter',
      label: 'Label',
      value: state.labelFilter,
      searchable: true,
      options: state.labels.map((label) => ({
        label: label.name,
        value: label.name,
        sub: `${state.tasks.filter((task) => task.labels.includes(label.name)).length} tasks`,
      })),
    },
    {
      // Real dates, so these are relative to today rather than the two month
      // names the mock data happened to use.
      key: 'dueFilter',
      label: 'Due date',
      value: state.dueFilter,
      options: [
        { label: 'Overdue', value: 'overdue' },
        { label: 'Due in 7 days', value: 'week' },
        { label: 'Due this month', value: 'month' },
        { label: 'Has a due date', value: 'set' },
        { label: 'No due date', value: 'none' },
      ],
    },
  ]

  return (
    <div ref={barRef} className="flex flex-wrap items-center gap-[9px]">
      <SearchField
        value={state.query}
        onChange={actions.setQuery}
        onClear={() => actions.setQuery('')}
        placeholder="Search tasks or task number"
        className="max-w-[400px] min-w-[220px] flex-1"
      />

      {filters.map((filter) => (
        <FilterChip
          key={filter.key}
          filter={filter}
          open={openFilter === filter.key}
          query={query}
          onQuery={setQuery}
          onToggle={() => {
            setOpenFilter(openFilter === filter.key ? null : filter.key)
            setQuery('')
          }}
          onPick={(key, value) => {
            actions.setFilter(key, value)
            setOpenFilter(null)
            setQuery('')
          }}
        />
      ))}

      {hasActiveFilter(state) && (
        <button
          type="button"
          onClick={actions.clearFilters}
          className="cursor-pointer rounded-[20px] bg-transparent px-[11px] py-[7px] text-xs leading-none font-medium text-ink/55 underline underline-offset-[3px] hover:text-ink"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
