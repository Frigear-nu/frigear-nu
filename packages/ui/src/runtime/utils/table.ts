import type { TableColumn, DropdownMenuItem } from '@nuxt/ui'
import defu from 'defu'
import { titleCase } from 'scule'
import type { Row } from '@tanstack/vue-table'

// generics go right after the type name
export type ColumnDefinerProps<T, TData = TableColumn<T>>
  // @ts-expect-error This is not typed properly...
  = Partial<Omit<TData, 'id'>> & Pick<TData, 'id'>

export const defineColumn = <Type = unknown, TData = TableColumn<Type>>(
  columnDef: ColumnDefinerProps<Type, TData> | string,
): TData => {
  let def: ColumnDefinerProps<Type, TData>
  if (typeof columnDef !== 'object') {
    def = {
      id: columnDef,
    }
  }
  else {
    def = columnDef
  }
  return defu(def, {
    id: crypto.randomUUID(),
    header: def.id ? titleCase(def.id as string) : undefined,
    cell: ({ row }) => row.original[def.id as keyof Type],
  }) as TData
}

type RowAction<T> = Omit<DropdownMenuItem, 'onSelect'> & {
  onSelect: (row: Row<T>) => void | Promise<void>
}
export const defineRowActions = <T>(row: Row<T>, action: RowAction<T>) => {
  return {
    ...action,
    onSelect: () => action.onSelect(row),
  }
}
