// Only added when `@frigear-nu/teams` is installed: a team's leads (`isTeamLead`, at or above the `leadFrom` role of the
// team kind's ladder) read and answer the team's mailbox.
export default defineNitroPlugin(() => {
  setInboxTeamLeadResolver((event, userId, teamId) => isTeamLead(event, userId, teamId))
})
