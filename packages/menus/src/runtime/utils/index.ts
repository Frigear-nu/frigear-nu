import type { MenuItem } from './menu'

export { extendMenu, defineMenuSource, registerMenuSource, parseMenuPath, deriveMenuItemId } from './menu'
export { extendMenuItem } from '../app/utils/extend'
export type { MenuItem, MenuSource, RegisterMenuSourceOptions } from './menu'

export const defineMenuItem = <T extends MenuItem>(item: T): T => item
