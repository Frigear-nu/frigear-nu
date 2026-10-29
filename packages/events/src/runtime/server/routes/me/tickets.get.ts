import myTickets from '../../bootstrap/my-tickets'

// The caller's tickets; the same handler serves the account bootstrap's `events:tickets:mine`.
export default defineEventHandler(myTickets)
