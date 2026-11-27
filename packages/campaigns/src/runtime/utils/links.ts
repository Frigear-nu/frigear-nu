// Default page paths, and the HTML form other sites can paste to sign people up.

/** The default path of each page; a module option moves or removes it. */
export const CAMPAIGNS_DEFAULT_PAGES = {
  confirm: '/newsletter/confirm',
  unsubscribe: '/newsletter/unsubscribe',
  account: '/account/newsletters',
} as const

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type CampaignEmbedTexts = {
  email: string
  name: string
  phone: string
  consent: string
  submit: string
}

/**
 * A plain HTML `<form>` for a site that cannot run the signup component: it posts to the subscribe route, which
 * answers a form post with a redirect to the confirm page ("check your inbox"). The `website` field is a honeypot that
 * stays hidden and empty.
 */
export function campaignEmbedSnippet(input: {
  action: string
  channels: readonly string[]
  texts: CampaignEmbedTexts
  locale?: string
}): string {
  const { texts } = input
  const lines = [
    `<form action="${escapeHtml(input.action)}" method="post">`,
    `  <label>${escapeHtml(texts.name)} <input type="text" name="name" autocomplete="name"></label>`,
  ]
  if (input.channels.includes('email')) lines.push(`  <label>${escapeHtml(texts.email)} <input type="email" name="email" autocomplete="email" required></label>`)
  if (input.channels.includes('sms')) lines.push(`  <label>${escapeHtml(texts.phone)} <input type="tel" name="phone" autocomplete="tel" placeholder="+45..."></label>`)
  lines.push(
    `  <label><input type="checkbox" name="consent" value="true" required> ${escapeHtml(texts.consent)}</label>`,
    '  <input type="text" name="website" tabindex="-1" autocomplete="off" style="display:none" aria-hidden="true">',
  )
  if (input.locale) lines.push(`  <input type="hidden" name="locale" value="${escapeHtml(input.locale)}">`)
  lines.push(`  <button type="submit">${escapeHtml(texts.submit)}</button>`, '</form>')
  return lines.join('\n')
}
