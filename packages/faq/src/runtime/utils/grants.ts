import { hasPublicGrant } from '@frigear-nu/grants/core'

type WithGrants = { grants: unknown }

/** Whether an item has no list of its own (`null`): everyone who reads its group reads it. */
export function faqItemInherits(item: WithGrants): boolean {
  return item.grants === null || item.grants === undefined
}

/**
 * Whether an item is readable, given `canRead` for one record (`grantsCanRead` on the server): its group must be, and so
 * must the item unless it inherits the group. An item can only narrow its group, so a public item in a restricted group
 * stays restricted.
 *
 * Status is not checked here: only `published` items reach anyone but staff.
 */
export async function isFaqItemReadable(group: WithGrants, item: WithGrants, canRead: (record: WithGrants) => Promise<boolean>): Promise<boolean> {
  if (!(await canRead(group))) return false
  return faqItemInherits(item) || canRead(item)
}

/** Whether an anonymous visitor reads the group's published item: the group is public and the item does not narrow that. */
export function isFaqItemPublic(group: WithGrants, item: WithGrants): boolean {
  return hasPublicGrant(group.grants) && (faqItemInherits(item) || hasPublicGrant(item.grants))
}
