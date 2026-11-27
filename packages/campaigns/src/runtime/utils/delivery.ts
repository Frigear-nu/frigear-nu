import type { CampaignAudience, CampaignContent, CampaignKind, CampaignSendChannel, Translated } from '../../types'

// Pure parts of the delivery engine (no server imports), shared by the server and the unit tests: finding and rewriting
// links, the unsubscribe headers, what to do with a stale claim, and whether a campaign is ready to send.

/** An `http(s)` URL in markdown or plain text; it ends at whitespace, a quote, `<`, `>` or a closing bracket. */
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/gi
/** Punctuation that ends a sentence (or closes markdown emphasis) rather than the URL. */
const TRAILING = /[.,;:!?*]+$/

function cleanUrl(match: string): { url: string, rest: string } {
  const url = match.replace(TRAILING, '')
  return { url, rest: match.slice(url.length) }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname
  }
  catch {
    return false
  }
}

/**
 * The distinct `http(s)` URLs in `texts`, in the order they first appear. Anchors (`#top`), relative paths and other
 * schemes (`mailto:`, `tel:`) are not links to track and are left out.
 */
export function extractCampaignLinks(texts: Iterable<string | null | undefined>): string[] {
  const found: string[] = []
  for (const text of texts) {
    if (!text) continue
    for (const match of text.matchAll(URL_PATTERN)) {
      const { url } = cleanUrl(match[0])
      if (isHttpUrl(url) && !found.includes(url)) found.push(url)
    }
  }
  return found
}

/**
 * `text` with every `http(s)` URL replaced by what `replace` answers for it (kept when it answers nothing). Anchors,
 * relative paths, `mailto:` and `tel:` links are never touched.
 */
export function rewriteCampaignLinks(text: string, replace: (url: string) => string | null | undefined): string {
  return text.replace(URL_PATTERN, (match) => {
    const { url, rest } = cleanUrl(match)
    if (!isHttpUrl(url)) return match
    return `${replace(url) ?? url}${rest}`
  })
}

/** Every text of a {@link Translated} value. */
export function translatedTexts(value: Translated | null | undefined): string[] {
  if (!value) return []
  return typeof value === 'string' ? [value] : Object.values(value)
}

/** A {@link Translated} value with `map` applied to each of its texts. */
export function mapTranslated(value: Translated, map: (text: string) => string): Translated {
  return typeof value === 'string' ? map(value) : Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, map(text)]))
}

/** The texts of a campaign's content that links are taken from: the email body, the SMS and the push URL. */
export function campaignLinkSources(content: CampaignContent, channels: readonly CampaignSendChannel[]): string[] {
  return [
    ...(channels.includes('email') ? translatedTexts(content.email?.body) : []),
    ...(channels.includes('sms') ? translatedTexts(content.sms?.body) : []),
    ...(channels.includes('push') && content.push?.url ? [content.push.url] : []),
  ]
}

/**
 * The RFC 2369 / RFC 8058 headers of a campaign email: mail apps show an unsubscribe button that posts
 * `List-Unsubscribe=One-Click` to `oneClickUrl` (the unsubscribe route, never a page).
 */
export function campaignUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/** A claimed delivery not finished within this time is claimed again (its deliver pass died). */
export const CAMPAIGN_CLAIM_STALE_MS = 10 * 60 * 1000

/** A delivery is claimed at most this many times; then it is `failed`. */
export const CAMPAIGN_MAX_ATTEMPTS = 3

/**
 * What to do with a delivery when looking for stale claims: `requeue` a claim older than {@link CAMPAIGN_CLAIM_STALE_MS}
 * that may be tried again, `fail` one that used its {@link CAMPAIGN_MAX_ATTEMPTS}, `null` for anything else.
 */
export function campaignStaleClaimAction(
  row: { status: string, claimedAt: Date | null, attempts: number },
  now: Date,
): 'requeue' | 'fail' | null {
  if (row.status !== 'sending' || !row.claimedAt) return null
  if (now.getTime() - row.claimedAt.getTime() < CAMPAIGN_CLAIM_STALE_MS) return null
  return row.attempts >= CAMPAIGN_MAX_ATTEMPTS ? 'fail' : 'requeue'
}

/** How a delivery ends after `notifyUser` answered for its channel. */
export function campaignNotifyOutcome(
  result: { channels: readonly string[], skipped: Partial<Record<string, string>> },
  channel: CampaignSendChannel,
): { status: 'sent' | 'skipped' | 'failed', skipReason: string | null } {
  if (result.channels.includes(channel)) return { status: 'sent', skipReason: null }
  const reason = result.skipped[channel] ?? 'unavailable'
  if (reason === 'failed') return { status: 'failed', skipReason: null }
  return { status: 'skipped', skipReason: reason }
}

/** The channels a kind of campaign may use: push only reaches users. */
export function campaignKindChannels(kind: CampaignKind): CampaignSendChannel[] {
  return kind === 'newsletter' ? ['email', 'sms'] : ['email', 'sms', 'push']
}

const hasText = (value: Translated | null | undefined) => translatedTexts(value).some(text => !!text.trim())

/**
 * What keeps a campaign from being sent, as zod-like issues: a channel the kind cannot use, a channel without its text,
 * an audience of the wrong kind or an empty one, `important` on a campaign to lists. Empty when it is ready.
 */
export function campaignSendIssues(campaign: {
  kind: CampaignKind
  channels: readonly CampaignSendChannel[]
  audience: CampaignAudience
  content: CampaignContent
  important: boolean
}): Array<{ path: string[], message: string }> {
  const issues: Array<{ path: string[], message: string }> = []
  const allowed = campaignKindChannels(campaign.kind)
  if (!campaign.channels.length) issues.push({ path: ['channels'], message: 'Pick at least one channel.' })
  for (const channel of campaign.channels) {
    if (!allowed.includes(channel)) issues.push({ path: ['channels'], message: `A ${campaign.kind} cannot be sent by ${channel}.` })
  }
  const { content } = campaign
  if (campaign.channels.includes('email') && (!hasText(content.email?.subject) || !hasText(content.email?.body))) {
    issues.push({ path: ['content', 'email'], message: 'Write the subject and text of the email.' })
  }
  if (campaign.channels.includes('sms') && !hasText(content.sms?.body)) {
    issues.push({ path: ['content', 'sms'], message: 'Write the text of the SMS.' })
  }
  if (campaign.channels.includes('push') && (!hasText(content.push?.title) || !hasText(content.push?.body))) {
    issues.push({ path: ['content', 'push'], message: 'Write the title and text of the push notification.' })
  }
  const { audience } = campaign
  if (campaign.kind === 'newsletter') {
    if (!audience.listIds?.length) issues.push({ path: ['audience', 'listIds'], message: 'Pick the lists to send to.' })
    if (audience.grants?.length || audience.userIds?.length) issues.push({ path: ['audience'], message: 'A campaign to lists goes to their subscribers only.' })
    if (campaign.important) issues.push({ path: ['important'], message: 'Only a message to users can be important.' })
  }
  else {
    if (!audience.grants?.length && !audience.userIds?.length) issues.push({ path: ['audience'], message: 'Name the people or groups to send to.' })
    if (audience.listIds?.length) issues.push({ path: ['audience', 'listIds'], message: 'A campaign to people goes to users; send one to lists to reach their subscribers.' })
  }
  return issues
}
