// Pure helpers, safe to import from the Vue app as well as Nitro code.
import type { PaymentItem } from '../../types'

export * from './api'

export type {
  CheckoutBeforeContext,
  CreatePaymentInput,
  CreatePaymentResult,
  ModuleOptions,
  PaymentDto,
  PaymentHookContext,
  PaymentItem,
  PaymentReference,
  PaymentStatus,
  RecentPaymentDto,
  RecentPaymentsDto,
  ResumeResponse,
} from '../../types'

/** Total of a list of items in minor units. */
export function sumItems(items: PaymentItem[]): number {
  return items.reduce((total, item) => total + item.amount * (item.quantity ?? 1), 0)
}
