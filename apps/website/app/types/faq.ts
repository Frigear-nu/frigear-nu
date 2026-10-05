import type { PageCardProps, ButtonProps } from '@nuxt/ui'
import type { ContactFormSchema } from '#shared/schema/forms/contact'

type ForwardedProps = Pick<PageCardProps, 'title' | 'description' | 'icon' | 'to' | 'spotlight' | 'variant' | 'class'>
export type FaqCardProps = ForwardedProps & {
  faqs?: {
    icon?: string
    trailingIcon?: string
    title: string
    details?: string
    lines?: string[]
    as?: string
  }[]
  links?: ButtonProps[]
  contact?: ButtonProps & {
    initial?: ContactFormSchema
  }
}
