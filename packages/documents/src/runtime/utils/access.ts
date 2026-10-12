import type { DocumentAudience } from '../../types'

type Node = { id: string, parentId: string | null, audience: DocumentAudience }

/**
 * Ids of the documents a viewer may see. An item is visible when it is shared with everyone or with one of the
 * viewer's groups, **and** every folder above it is visible too: a folder gates its contents. Managers see everything.
 *
 * `shares` maps a document id to the group ids it is shared with.
 */
export function visibleDocumentIds(
  items: Node[],
  shares: Map<string, Set<string>>,
  viewer: { manager: boolean, groupIds: Set<string> },
): Set<string> {
  const byId = new Map(items.map(item => [item.id, item]))
  const memo = new Map<string, boolean>()

  const own = (item: Node) => viewer.manager
    || item.audience === 'everyone'
    || [...(shares.get(item.id) ?? [])].some(groupId => viewer.groupIds.has(groupId))

  const visible = (item: Node, seen = new Set<string>()): boolean => {
    const known = memo.get(item.id)
    if (known !== undefined) return known
    // A cycle or a missing parent can only come from corrupt data; hide rather than leak.
    let result = false
    if (!seen.has(item.id)) {
      seen.add(item.id)
      const parent = item.parentId ? byId.get(item.parentId) : null
      result = own(item) && (item.parentId === null || (!!parent && visible(parent, seen)))
    }
    memo.set(item.id, result)
    return result
  }

  return new Set(items.filter(item => visible(item)).map(item => item.id))
}

/** Folders from the root down to the folder `id` (inclusive); empty for the root or an unknown id. */
export function ancestorChain<T extends { id: string, parentId: string | null }>(items: T[], id: string | null): T[] {
  const byId = new Map(items.map(item => [item.id, item]))
  const chain: T[] = []
  const seen = new Set<string>()
  let current = id ? byId.get(id) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

/** Ids of `id` and everything below it. */
export function subtreeIds(items: { id: string, parentId: string | null }[], id: string): string[] {
  const children = new Map<string, string[]>()
  for (const item of items) {
    if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item.id])
  }
  const result: string[] = []
  const stack = [id]
  while (stack.length) {
    const next = stack.pop()!
    if (result.includes(next)) continue
    result.push(next)
    stack.push(...(children.get(next) ?? []))
  }
  return result
}
