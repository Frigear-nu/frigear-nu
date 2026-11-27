import type { DropdownMenuItem } from '@nuxt/ui'
import CampaignFormSlideover from '../components/CampaignFormSlideover.vue'
import CampaignScheduleModal from '../components/CampaignScheduleModal.vue'
import { campaignAvailableActions, campaignDuplicateBody } from '../utils/admin-campaign'
import { campaignsApi } from '../../utils/api'
import type { CampaignDto, CampaignKind, CampaignPreviewDto } from '../../../types'
import { useCampaignsAccessState } from './useCampaignsAccess'
import { $fetch, navigateTo, useAction, useCampaignsLinks, useConfirmDialog, useErrorToast, useFormat, useModuleT, useOverlay } from '#imports'

export type CampaignMenuOptions = {
  /** Shows "Open" first (off on the campaign's own page). Default `true`. */
  open?: boolean
  /** Runs after the campaign changed (edited, sent, scheduled, cancelled) with the new one. */
  onChanged?: (campaign: CampaignDto) => unknown
  /** Runs after the draft was deleted. */
  onRemoved?: () => unknown
}

/**
 * What staff can do with a campaign: `create` (a slideover; goes to the new draft and resolves with it, or `false`),
 * `edit`, `duplicate` (a new draft, then its page), `send` (confirms with how many people it reaches now), `schedule`
 * (picks a time), `cancel` and `remove` (both confirm), and `menu(campaign)`: Open | Edit, Duplicate, Cancel | Delete.
 * Each action is offered only in the states and to the people the API allows it for (`useCampaignsAccess()`, which the
 * page awaits first). Each resolves with the changed campaign, or `false`.
 */
export function useCampaignActions() {
  const t = useModuleT('campaigns')
  const links = useCampaignsLinks()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const showError = useErrorToast()
  const format = useFormat()
  const can = useCampaignsAccessState()
  const { run } = useAction()

  const allowed = (campaign: CampaignDto) => campaignAvailableActions(campaign, can.value)

  /** Opens the create form; `listIds` starts a newsletter to those lists (from a newsletter's page). */
  async function create(kind?: CampaignKind, options: { listIds?: string[] } = {}): Promise<CampaignDto | false> {
    const saved = await overlay.create(CampaignFormSlideover, { destroyOnClose: true, props: { kind, listIds: options.listIds } }).open() as CampaignDto | false
    if (!saved) return false
    const to = links.adminCampaign(saved.id)
    if (to) await navigateTo(to)
    return saved
  }

  const edit = async (campaign: CampaignDto): Promise<CampaignDto | false> =>
    await overlay.create(CampaignFormSlideover, { destroyOnClose: true, props: { campaign } }).open() as CampaignDto | false

  async function duplicate(campaign: CampaignDto): Promise<CampaignDto | false> {
    const name = t('campaign.copyName', '{name} (copy)', { name: campaign.name })
    const copy = await run(
      () => $fetch<CampaignDto>(campaignsApi.admin.campaigns, { method: 'POST', body: campaignDuplicateBody(campaign, name) }),
      { success: t('campaign.duplicated', 'Created {name}', { name }), error: t('campaign.duplicateFailed', 'Could not duplicate the campaign') },
    )
    if (!copy) return false
    const to = links.adminCampaign(copy.id)
    if (to) await navigateTo(to)
    return copy
  }

  /** How many people the campaign reaches now, per channel, as one sentence; `null` (with a toast) when it reaches nobody. */
  async function reach(campaign: CampaignDto): Promise<string | null> {
    try {
      const preview = await $fetch<CampaignPreviewDto>(campaignsApi.admin.preview(campaign.id))
      if (!preview.recipients) {
        showError(new Error(t('campaign.reachesNobody', 'Nobody would get it: check its audience.')), t('campaign.sendFailed', 'Could not send the campaign'))
        return null
      }
      const channels = Object.entries(preview.channels)
        .map(([channel, count]) => t(`campaign.reachChannel.${channel}`, { email: '{count} by email', sms: '{count} by SMS', push: '{count} by push' }[channel] ?? '{count}', { count: count ?? 0 }))
        .join(', ')
      return preview.recipients === 1
        ? t('campaign.reachOne', 'It reaches {count} person now: {channels}.', { count: preview.recipients, channels })
        : t('campaign.reach', 'It reaches {count} people now: {channels}.', { count: preview.recipients, channels })
    }
    catch (error) {
      showError(error, t('campaign.previewFailed', 'Could not count who it reaches'))
      return null
    }
  }

  async function send(campaign: CampaignDto): Promise<CampaignDto | false> {
    const reaches = await reach(campaign)
    if (!reaches) return false
    const confirmed = await confirm({
      title: t('campaign.sendTitle', 'Send {name} now?', { name: campaign.name }),
      description: [
        reaches,
        campaign.important ? t('campaign.sendImportantNote', 'It is important: it also reaches people on channels they turned off.') : '',
        t('campaign.sendNote', 'It goes out in batches over the next minutes. Once sent it cannot be taken back.'),
      ].filter(Boolean).join(' '),
      confirmText: t('campaign.sendAction', 'Send campaign'),
    })
    if (!confirmed) return false
    const sent = await run(
      () => $fetch<CampaignDto>(campaignsApi.admin.send(campaign.id), { method: 'POST' }),
      { success: t('campaign.sent', 'Sending {name}', { name: campaign.name }), error: t('campaign.sendFailed', 'Could not send the campaign') },
    )
    return sent ?? false
  }

  async function schedule(campaign: CampaignDto): Promise<CampaignDto | false> {
    const reaches = await reach(campaign)
    if (!reaches) return false
    const at = await overlay.create(CampaignScheduleModal, { destroyOnClose: true, props: { name: campaign.name, recipients: reaches } }).open() as Date | false
    if (!at) return false
    const scheduled = await run(
      () => $fetch<CampaignDto>(campaignsApi.admin.schedule(campaign.id), { method: 'POST', body: { scheduledAt: at.toISOString() } }),
      {
        success: t('campaign.scheduled', 'Scheduled {name} for {date}', { name: campaign.name, date: format.dateTime(at) }),
        error: t('campaign.scheduleFailed', 'Could not schedule the campaign'),
      },
    )
    return scheduled ?? false
  }

  async function cancel(campaign: CampaignDto): Promise<CampaignDto | false> {
    const confirmed = await confirm({
      title: t('campaign.cancelTitle', 'Cancel {name}?', { name: campaign.name }),
      description: campaign.status === 'sending'
        ? t('campaign.cancelSendingDescription', 'What has gone out stays sent; nobody else gets it. Its counts and links are kept. This cannot be undone.')
        : t('campaign.cancelScheduledDescription', 'It will not go out. Its texts are kept; duplicate it to send it later. This cannot be undone.'),
      confirmText: t('campaign.cancelCampaignAction', 'Cancel campaign'),
      destructive: true,
    })
    if (!confirmed) return false
    const cancelled = await run(
      () => $fetch<CampaignDto>(campaignsApi.admin.cancel(campaign.id), { method: 'POST' }),
      { success: t('campaign.cancelled', 'Cancelled {name}', { name: campaign.name }), error: t('campaign.cancelFailed', 'Could not cancel the campaign') },
    )
    return cancelled ?? false
  }

  async function remove(campaign: CampaignDto): Promise<boolean> {
    const confirmed = await confirm({
      title: t('campaign.deleteTitle', 'Delete {name}?', { name: campaign.name }),
      description: t('campaign.deleteDescription', 'The draft and its texts are deleted. It was never sent, so nobody is affected. This cannot be undone.'),
      confirmText: t('campaign.deleteAction', 'Delete campaign'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(campaignsApi.admin.campaign(campaign.id), { method: 'DELETE' }).then(() => true),
      { success: t('campaign.deleted', 'Deleted {name}', { name: campaign.name }), error: t('campaign.deleteFailed', 'Could not delete the campaign') },
    )
    return done === true
  }

  function menu(campaign: CampaignDto, options: CampaignMenuOptions = {}): DropdownMenuItem[][] {
    const may = allowed(campaign)
    const changed = (action: (campaign: CampaignDto) => Promise<CampaignDto | false>) => async () => {
      const next = await action(campaign)
      if (next) await options.onChanged?.(next)
    }
    const open: DropdownMenuItem[] = []
    const to = links.adminCampaign(campaign.id)
    if (options.open !== false && to) open.push({ label: t('campaign.open', 'Open'), icon: 'i-lucide-arrow-right', to })
    const edits: DropdownMenuItem[] = [
      ...(may.edit ? [{ label: t('campaign.edit', 'Edit campaign'), icon: 'i-lucide-pencil', onSelect: changed(edit) }] : []),
      ...(may.duplicate ? [{ label: t('campaign.duplicate', 'Duplicate'), icon: 'i-lucide-copy', onSelect: () => { void duplicate(campaign) } }] : []),
      ...(may.cancel ? [{ label: t('campaign.cancelCampaignAction', 'Cancel campaign'), icon: 'i-lucide-circle-stop', onSelect: changed(cancel) }] : []),
    ]
    const destructive: DropdownMenuItem[] = may.remove
      ? [{
          label: t('campaign.deleteAction', 'Delete campaign'),
          icon: 'i-lucide-trash-2',
          color: 'error',
          onSelect: async () => {
            if (await remove(campaign)) await options.onRemoved?.()
          },
        }]
      : []
    return [open, edits, destructive].filter(group => group.length)
  }

  return { allowed, create, edit, duplicate, send, schedule, cancel, remove, menu }
}
