// Pure helpers, safe to import from the Vue app as well as Nitro code.
import type { PaymentItem } from '../../types'

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
} from '../../types'

/** Total of a list of items in minor units. */
export function sumItems(items: PaymentItem[]): number {
  return items.reduce((total, item) => total + item.amount * (item.quantity ?? 1), 0)
}

/** Resolves a relative path against `origin`, and only accepts absolute URLs on the same origin. */
export function resolveSameOriginUrl(input: string, origin: string): string | null {
  if (input.startsWith('/')) {
    // `//host` and `/\host` are protocol-relative / browser-normalised to another host.
    if (input.startsWith('//') || input.startsWith('/\\')) return null
    return `${origin}${input}`
  }
  try {
    return new URL(input).origin === new URL(origin).origin ? input : null
  }
  catch {
    return null
  }
}
