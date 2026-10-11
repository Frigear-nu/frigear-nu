/** Lower `order` first; widgets without one last, keeping registration order. */
export function sortWidgets<T extends { order?: number }>(widgets: T[]): T[] {
  return [...widgets].sort((a, b) => {
    if (a.order === undefined && b.order === undefined) return 0
    if (a.order === undefined) return 1
    if (b.order === undefined) return -1
    return a.order - b.order
  })
}
