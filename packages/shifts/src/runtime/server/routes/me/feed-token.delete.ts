import { noContent } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'

// Revokes my calendar feed: its URL answers 404 from now on. Session only (`shifts:feed`).
export default defineEventHandler(async (event) => {
  const principal = await authorize(event, shiftsAccess.permissions.feed)
  await shiftsRevokeFeedToken(Number(principal.user.id))
  return noContent(event)
})
