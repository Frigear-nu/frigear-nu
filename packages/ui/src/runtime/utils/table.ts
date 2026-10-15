import { h } from 'vue'

/** One sorted column in `UTable`'s shape. */
export interface TableSortState {
  id: string
  desc: boolean
}

/** The meta of a column holding numbers: right-aligned, tabular figures so digits line up. */
export const numericColumn = { class: { th: 'text-right', td: 'text-right tabular-nums' } } as const

/** A dimmed dash for a cell without a value (no date, no role, ...). */
export function emptyCell() {
  return h('span', { class: 'text-dimmed' }, '—')
}

/** The sort after a click on `id`'s header: ascending, then descending, then unsorted. */
export function nextTableSort(current: TableSortState | null | undefined, id: string): TableSortState | null {
  if (current?.id !== id) return { id, desc: false }
  return current.desc ? null : { id, desc: true }
}

/** The `sort` / `order` query of a server-sorted list (both `undefined` when unsorted). */
export function tableSortQuery(sort: TableSortState | null | undefined): { sort?: string, order?: 'asc' | 'desc' } {
  return sort ? { sort: sort.id, order: sort.desc ? 'desc' : 'asc' } : { sort: undefined, order: undefined }
}

/** The first and last row number shown on `page` (1-based), `{ from: 0, to: 0 }` when it is empty. */
export function tablePageRange(page: number, pageSize: number, total: number): { from: number, to: number } {
  const from = (page - 1) * pageSize + 1
  if (total <= 0 || from > total) return { from: 0, to: 0 }
  return { from, to: Math.min(page * pageSize, total) }
}
