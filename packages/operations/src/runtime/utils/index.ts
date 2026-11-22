// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './links'
export * from './api'
export * from './status'
export * from './slug'
export * from './venue'

export type {
  AdminOperationDto,
  ModuleOptions,
  OperationCreatedContext,
  OperationDto,
  OperationLocation,
  OperationStatus,
  OperationStatusChangedContext,
  OperationUpdatedContext,
  OperationVenueLayout,
  OperationVenueUnderlay,
  Schedule,
  Translated,
} from '../../types'

/** Random, prefixed id (`<prefix>_<32 hex>`): the one of `@frigear-nu/module-kit/id`. */
export { newId } from '@frigear-nu/module-kit/id'
