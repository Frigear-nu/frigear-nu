import type { PublicModuleOptions } from '../../../types'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/** Locale-aware links to the module's pages (`campaigns.settings.pages`). Each returns `undefined` when that page is off. */
export function useCampaignsLinks() {
  const { localize } = useLocaleLink()
  const pages = (useRuntimeConfig().public.campaigns as PublicModuleOptions | undefined)?.pages ?? {}

  return {
    /** The staff page of the lists. */
    adminLists: () => pages.adminLists ? localize(pages.adminLists) : undefined,
    /** One list's staff page. */
    adminList: (id: string) => pages.adminList ? localize(pages.adminList.replace(':id', encodeURIComponent(id))) : undefined,
    /** The staff list of campaigns. */
    adminCampaigns: () => pages.adminCampaigns ? localize(pages.adminCampaigns) : undefined,
    /** One campaign's staff page. */
    adminCampaign: (id: string) => pages.adminCampaign ? localize(pages.adminCampaign.replace(':id', encodeURIComponent(id))) : undefined,
    /** The signed-in user's subscriptions. */
    account: () => pages.account ? localize(pages.account) : undefined,
  }
}
