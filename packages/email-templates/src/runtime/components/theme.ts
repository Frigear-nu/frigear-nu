import { useRuntimeConfig } from 'nitropack/runtime'
import type { EmailTemplatesRuntimeConfig } from '../types'

// Fixed design tokens (the MVP's Tailwind gray scale and sizes, as inline styles: email clients have no CSS classes).
export const tokens = {
  page: '#f3f4f6', // gray-100
  card: '#ffffff',
  border: '#e5e7eb', // gray-200
  text: '#374151', // gray-700
  heading: '#111827', // gray-900
  muted: '#6b7280', // gray-500
  faint: '#9ca3af', // gray-400
  font: '-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif',
}

/** Brand settings from `emailTemplates` options / `NUXT_EMAIL_TEMPLATES_*`. Read inside the renderer's SSR app. */
export function useEmailTheme() {
  const config = (useRuntimeConfig() as { emailTemplates?: Partial<EmailTemplatesRuntimeConfig> }).emailTemplates ?? {}
  const logoUrl = config.logoUrl
    ? /^https?:\/\//.test(config.logoUrl) ? config.logoUrl : `${(config.siteUrl ?? '').replace(/\/$/, '')}${config.logoUrl}`
    : ''
  return {
    brandName: config.brandName || 'Frigear',
    logoUrl,
    primary: config.colors?.primary || '#2563eb',
    danger: config.colors?.danger || '#dc2626',
  }
}
