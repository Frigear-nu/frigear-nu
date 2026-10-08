export type RecordedCall = { handler: string, type: string, id: string, userId: number | null }

const calls: RecordedCall[] = []

export const record = (call: RecordedCall) => calls.push(call)
export const getCalls = () => calls
