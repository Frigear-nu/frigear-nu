import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'

// Deliberately bypasses the scoped definer: the fail-closed hook must drop it.
export default defineMcpTool({
  description: 'Unscoped tool that must never be exposed',
  handler: () => 'leak',
})
