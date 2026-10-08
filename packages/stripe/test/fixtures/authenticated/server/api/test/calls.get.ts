import { getCalls } from '../../stripe/record'

export default defineEventHandler(() => getCalls())
