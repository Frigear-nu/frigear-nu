import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { H3Event } from 'h3'
import type { AdminDocumentDto, DocumentDto, DocumentListing } from '../../../types'
import { visibleDocumentIds, ancestorChain } from '../../utils'

export type DocumentRow = typeof schema.documents.$inferSelect

export const toDto = (row: DocumentRow): DocumentDto => ({
  id: row.id,
  parentId: row.parentId ?? null,
  kind: row.kind,
  title: row.title,
  description: row.description ?? null,
  icon: row.icon ?? null,
  filename: row.filename ?? null,
  contentType: row.contentType ?? null,
  size: row.size ?? null,
})

export const toAdminDto = (row: DocumentRow, shares: Map<string, Set<string>>): AdminDocumentDto => ({
  ...toDto(row),
  sortOrder: row.sortOrder,
  audience: row.audience,
  groupIds: [...(shares.get(row.id) ?? [])],
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** Every document and the groups each one is shared with. Documents are few, so the tree is resolved in memory. */
export async function loadDocuments(): Promise<{ rows: DocumentRow[], shares: Map<string, Set<string>> }> {
  const [rows, shareRows] = await Promise.all([
    db.select().from(schema.documents),
    db.select().from(schema.documentShares),
  ])
  const shares = new Map<string, Set<string>>()
  for (const share of shareRows) shares.set(share.documentId, (shares.get(share.documentId) ?? new Set()).add(share.groupId))
  rows.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1) || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
  return { rows, shares }
}

/** The ids a viewer may see, given the documents loaded by `loadDocuments`. */
export async function visibleIdsFor(
  viewer: { userId: number, manager: boolean },
  data: { rows: DocumentRow[], shares: Map<string, Set<string>> },
): Promise<Set<string>> {
  const groupIds = viewer.manager ? new Set<string>() : new Set(await getUserGroupIds(viewer.userId))
  return visibleDocumentIds(data.rows, data.shares, { manager: viewer.manager, groupIds })
}

export function listFolder<Row extends DocumentRow, Dto extends DocumentDto>(
  rows: Row[],
  parentId: string | null,
  visible: Set<string>,
  map: (row: Row) => Dto,
): DocumentListing<Dto> {
  const folder = parentId ? rows.find(row => row.id === parentId) : undefined
  if (parentId && (!folder || folder.kind !== 'folder' || !visible.has(folder.id))) {
    throw createError({ statusCode: 404, statusMessage: 'Folder not found.' })
  }
  return {
    folder: folder ? map(folder) : null,
    breadcrumb: ancestorChain(rows, parentId).map(map),
    items: rows.filter(row => (row.parentId ?? null) === parentId && visible.has(row.id)).map(map),
  }
}

export async function findDocument(id: string): Promise<DocumentRow> {
  const [row] = await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  return row
}

/** Replaces the groups a document is shared with. */
export async function setShares(documentId: string, groupIds: string[]) {
  await db.delete(schema.documentShares).where(eq(schema.documentShares.documentId, documentId))
  const unique = [...new Set(groupIds)]
  if (unique.length) {
    // Only ids of existing groups can be shared with.
    const existing = await db.select({ id: schema.userGroups.id }).from(schema.userGroups).where(inArray(schema.userGroups.id, unique))
    if (existing.length) await db.insert(schema.documentShares).values(existing.map(group => ({ documentId, groupId: group.id })))
  }
}

/** The folder a document goes into: root, or an existing folder. */
export async function assertFolder(parentId: string | null | undefined): Promise<string | null> {
  if (!parentId) return null
  const parent = await findDocument(parentId).catch(() => undefined)
  if (!parent || parent.kind !== 'folder') throw createError({ statusCode: 400, statusMessage: 'The target must be an existing folder.' })
  return parent.id
}

export const queryParent = (event: H3Event) => {
  const value = getQuery(event).parent
  return typeof value === 'string' && value ? value : null
}
