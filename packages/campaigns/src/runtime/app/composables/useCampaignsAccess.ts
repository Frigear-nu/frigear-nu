import { authApi } from '@frigear-nu/auth/api'
import { campaignPermissions } from '../utils/admin-campaign'
import type { CampaignPermissions } from '../utils/admin-campaign'
import { computed, useFetch, useNuxtData } from '#imports'
import type { ComputedRef } from 'vue'

type AccessDto = { permissions?: string[] }

/** The `useFetch` key of the viewer's access, shared by the pages and `useCampaignActions()`. */
export const CAMPAIGNS_ACCESS_KEY = 'campaigns:access'

/**
 * What the viewer may do with campaigns (`GET /api/auth/me/access`): manage, send, send important messages, see
 * recipients. Display only: the routes check again. Pages `await` it, so the first render shows the right actions;
 * `useCampaignActions()` reads the same data.
 */
export async function useCampaignsAccess(): Promise<ComputedRef<CampaignPermissions>> {
  const { data } = await useFetch<AccessDto>(authApi.me.access, {
    key: CAMPAIGNS_ACCESS_KEY,
    default: () => ({ permissions: [] }),
    // Signed out or refused: no permissions, the page shows its own forbidden state.
    onResponseError: () => {},
  })
  return computed(() => campaignPermissions(data.value?.permissions ?? []))
}

/** The access a page loaded with {@link useCampaignsAccess}, without fetching (none until it did). */
export function useCampaignsAccessState(): ComputedRef<CampaignPermissions> {
  const { data } = useNuxtData<AccessDto>(CAMPAIGNS_ACCESS_KEY)
  return computed(() => campaignPermissions(data.value?.permissions ?? []))
}
