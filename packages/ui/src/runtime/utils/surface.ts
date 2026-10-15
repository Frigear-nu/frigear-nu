/** The surface every card shares (`SectionCard`, `TableCard`, `StatCard`, `ListCard`). */
export const surfaceClass = 'bg-elevated/50 ring ring-default rounded-lg overflow-hidden'

export interface TableUi {
  th?: string
  td?: string
  tr?: string
  [slot: string]: string | undefined
}

/**
 * The `:ui` of a `UTable` inside a `TableCard`: muted headers, roomier cells, clickable rows.
 * `overrides` replace single slots (`tableUi({ tr: '' })` for rows that do not open anything).
 */
export function tableUi(overrides: TableUi = {}): TableUi {
  return { th: 'text-muted font-normal', td: 'py-3', tr: 'cursor-pointer', ...overrides }
}
