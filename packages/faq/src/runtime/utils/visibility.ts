import { isEmptyVisibility, isVisible, parseVisibility } from '@frigear-nu/audience'
import type { Viewer, Visibility } from '@frigear-nu/audience'

/** An empty visibility (`{}`) is stored as `null`: both mean "signed-in viewers", or "inherits the group" on an item. */
export function normalizeVisibility(visibility: Visibility | null | undefined): Visibility | null {
  return isEmptyVisibility(visibility) ? null : visibility!
}

/**
 * Whether the viewer reads an item: its group is visible to them, and so is the item unless it is empty and inherits
 * the group. An item can only narrow its group, so a public item in a signed-in-only group stays hidden from
 * anonymous visitors. Both values are read with `parseVisibility`, so an unknown key fails closed.
 *
 * Status is not checked here: only `published` items reach anyone but staff.
 */
export function isFaqItemVisible(
  group: { visibility: unknown },
  item: { visibility: unknown },
  viewer: Viewer | null,
): boolean {
  if (!isVisible(parseVisibility(group.visibility), viewer)) return false
  const own = parseVisibility(item.visibility)
  return isEmptyVisibility(own) || isVisible(own, viewer)
}

/** Whether an anonymous visitor reads the group's published item: the group is public and the item does not narrow that. */
export function isFaqItemPublic(group: { visibility: unknown }, item: { visibility: unknown }): boolean {
  return isFaqItemVisible(group, item, null)
}
