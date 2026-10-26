// A provider whose data source is down: the bootstrap still answers with the others.
export default async function broken(): Promise<never> {
  throw new Error('database unavailable')
}
