import { z } from 'zod'

/**
 * Shown to the agent in tool descriptions and errors, so it can explain the limit to the user
 * instead of retrying or looking for a way around it.
 */
export const DELIVERY_NOTICE = 'Delivery settings (email recipients, webhooks) are intentionally not available through MCP: letting an agent change where answers are sent could be used to exfiltrate submissions. A person must change them in the admin UI. Do not try to work around this; tell the user to do it there.'

export const formDefinitionInput = z.record(z.string(), z.unknown())
  .describe(`The form definition (fields, steps, storage, access). Use get-form-definition on an existing form to see the shape. Do not include "delivery". ${DELIVERY_NOTICE}`)

export const formSlug = z.string().min(1).max(100).describe('Lowercase letters, digits and dashes.')

export const deliveryRefusal = () => createError({
  statusCode: 400,
  statusMessage: `Delivery settings cannot be set through MCP. ${DELIVERY_NOTICE}`,
})
