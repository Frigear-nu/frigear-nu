import type { H3Event } from 'h3'

// Soft integrations, set by the server plugins `module.ts` adds only when the other module is installed, so this
// module never names an auto-import of a module that may be missing.

/** Whether `userId` leads team `teamId` (`isTeamLead` of `@frigear-nu/teams`). */
export type InboxTeamLeadResolver = (event: H3Event, userId: string | number, teamId: string) => Promise<boolean>

let teamLeadResolver: InboxTeamLeadResolver | undefined

/** Set by the teams plugin. A host may set its own to decide who leads a team mailbox. */
export function setInboxTeamLeadResolver(resolver: InboxTeamLeadResolver | undefined): void {
  teamLeadResolver = resolver
}

/** Whether `userId` leads team `teamId`; always `false` without teams (or another resolver). */
export async function inboxIsTeamLead(event: H3Event, userId: string | number, teamId: string): Promise<boolean> {
  if (!teamLeadResolver) return false
  try {
    return await teamLeadResolver(event, userId, teamId)
  }
  catch (error) {
    console.error('[inbox] the team lead check failed, the user is not treated as a lead', error)
    return false
  }
}
