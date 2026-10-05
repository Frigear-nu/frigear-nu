export type DisabledRange = [string, string | Date, string | Date]
export type ParsedDisabledRange = [string, Date, Date]

export type PublicPrice = {
  id: string
  images: string[] | null
  title: string
  title_en?: string
  description: string | null
  description_en?: string
  price: number
  currency: string
  interval: string | 'month' | 'year'
  intervalCount: number
  disabledRanges: ParsedDisabledRange[]
}

// TODO: Move methods to own file
const replacers: Record<string, () => string | number> = {
  fullYear: () => new Date().getFullYear(),
}

export const parseDisabledRangeDate = (text?: string): Date => {
  if (!text) {
    return new Date()
  }

  const parsedText = text.replaceAll(/\{(\w+)\}/g, (_, key) => {
    return replacers[key as keyof typeof replacers]?.().toString() || key
  })

  // Standardizes to midnight UTC or local time based on configuration needs
  return new Date(parsedText)
}

export const parseDisabledRange = (range: DisabledRange): ParsedDisabledRange => {
  return [
    range[0],
    typeof range[1] === 'string' ? parseDisabledRangeDate(range[1]) : range[1],
    typeof range[2] === 'string' ? parseDisabledRangeDate(range[2]) : range[2],
  ]
}

export const parseDisabledRangesFromJsonString = (rangeText: string): ParsedDisabledRange[] => {
  try {
    const parsed = JSON.parse(rangeText) as DisabledRange[]
    return parsed.map(parseDisabledRange)
  }
  catch (err) {
    if (import.meta.dev) {
      console.error('Failed to parse disabled ranges', err, rangeText)
    }
    return []
  }
}

// 2. Fixed logical comparison operators
export const isDateWithinDisabledRange = (targetDate: Date, [_, start, end]: ParsedDisabledRange): boolean => {
  return targetDate >= start && targetDate <= end
}
