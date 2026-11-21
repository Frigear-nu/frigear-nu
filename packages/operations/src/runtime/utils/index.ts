// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './links'
export * from './api'
export * from './status'
export * from './slug'

export type {
  AdminOperationDto,
  ModuleOptions,
  OperationCreatedContext,
  OperationDto,
  OperationLocation,
  OperationStatus,
  OperationStatusChangedContext,
  OperationUpdatedContext,
  Schedule,
  Translated,
} from '../types'

/** Random, prefixed id (`opr_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
