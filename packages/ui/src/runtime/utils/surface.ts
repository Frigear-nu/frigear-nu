/** The surface every card shares (`SectionCard`, `TableCard`, `StatCard`, `ListCard`). */
export const surfaceClass = 'bg-elevated/50 ring ring-default rounded-lg overflow-hidden'

export interface TableUi {
  root?: string
  th?: string
  td?: string
  tr?: string
  [slot: string]: string | undefined
}

export interface TableUiOptions {
  /**
   * For a `UTable sticky`: the table scrolls inside its card (`max-h-[70vh]`) so the header stays in view. Nuxt UI
   * gives the sticky header its own translucent background.
   */
  sticky?: boolean
}

/**
 * The `:ui` of a `UTable` inside a `TableCard`: small muted headers, compact rows on desktop and taller (touch
 * friendly) rows on mobile, clickable rows. `overrides` replace single slots (`tableUi({ tr: '' })` for rows that do
 * not open anything).
 */
export function tableUi(overrides: TableUi = {}, options: TableUiOptions = {}): TableUi {
  return {
    ...(options.sticky ? { root: 'max-h-[70vh]' } : {}),
    th: 'text-muted text-xs font-normal py-2',
    td: 'max-md:py-3 md:py-2',
    tr: 'cursor-pointer',
    ...overrides,
  }
}
