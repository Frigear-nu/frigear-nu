import type { FormField, PhoneConfig } from '../../types'

/** ISO 3166-1 alpha-2 code -> international dialing code (digits only, no `+`). */
const DIAL_CODES: Record<string, string> = {
  AD: '376', AE: '971', AF: '93', AG: '1268', AI: '1264', AL: '355', AM: '374', AO: '244', AR: '54', AS: '1684',
  AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994', BA: '387', BB: '1246', BD: '880', BE: '32', BF: '226',
  BG: '359', BH: '973', BI: '257', BJ: '229', BL: '590', BM: '1441', BN: '673', BO: '591', BQ: '599', BR: '55',
  BS: '1242', BT: '975', BW: '267', BY: '375', BZ: '501', CA: '1', CC: '61', CD: '243', CF: '236', CG: '242',
  CH: '41', CI: '225', CK: '682', CL: '56', CM: '237', CN: '86', CO: '57', CR: '506', CU: '53', CV: '238',
  CW: '599', CX: '61', CY: '357', CZ: '420', DE: '49', DJ: '253', DK: '45', DM: '1767', DO: '1809', DZ: '213',
  EC: '593', EE: '372', EG: '20', EH: '212', ER: '291', ES: '34', ET: '251', FI: '358', FJ: '679', FK: '500',
  FM: '691', FO: '298', FR: '33', GA: '241', GB: '44', GD: '1473', GE: '995', GF: '594', GG: '44', GH: '233',
  GI: '350', GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30', GT: '502', GU: '1671', GW: '245',
  GY: '592', HK: '852', HN: '504', HR: '385', HT: '509', HU: '36', ID: '62', IE: '353', IL: '972', IM: '44',
  IN: '91', IO: '246', IQ: '964', IR: '98', IS: '354', IT: '39', JE: '44', JM: '1876', JO: '962', JP: '81',
  KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1869', KP: '850', KR: '82', KW: '965', KY: '1345',
  KZ: '7', LA: '856', LB: '961', LC: '1758', LI: '423', LK: '94', LR: '231', LS: '266', LT: '370', LU: '352',
  LV: '371', LY: '218', MA: '212', MC: '377', MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389',
  ML: '223', MM: '95', MN: '976', MO: '853', MP: '1670', MQ: '596', MR: '222', MS: '1664', MT: '356', MU: '230',
  MV: '960', MW: '265', MX: '52', MY: '60', MZ: '258', NA: '264', NC: '687', NE: '227', NF: '672', NG: '234',
  NI: '505', NL: '31', NO: '47', NP: '977', NR: '674', NU: '683', NZ: '64', OM: '968', PA: '507', PE: '51',
  PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508', PR: '1787', PS: '970', PT: '351', PW: '680',
  PY: '595', QA: '974', RE: '262', RO: '40', RS: '381', RU: '7', RW: '250', SA: '966', SB: '677', SC: '248',
  SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SJ: '47', SK: '421', SL: '232', SM: '378', SN: '221',
  SO: '252', SR: '597', SS: '211', ST: '239', SV: '503', SX: '1721', SY: '963', SZ: '268', TC: '1649', TD: '235',
  TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670', TM: '993', TN: '216', TO: '676', TR: '90', TT: '1868',
  TV: '688', TW: '886', TZ: '255', UA: '380', UG: '256', US: '1', UY: '598', UZ: '998', VA: '39', VC: '1784',
  VE: '58', VG: '1284', VI: '1340', VN: '84', VU: '678', WF: '681', WS: '685', XK: '383', YE: '967', YT: '262',
  ZA: '27', ZM: '260', ZW: '263',
}

export const DEFAULT_PHONE_COUNTRY = 'DK'

/** E.164: at most 15 digits including the country code. */
const MAX_DIGITS = 15
const MIN_NATIONAL_DIGITS = 4

export type PhoneCountry = { code: string, dial: string, flag: string }

const flag = (code: string) => String.fromCodePoint(...[...code].map(char => 0x1F1A5 + char.charCodeAt(0)))

export const allPhoneCountries: PhoneCountry[] = Object.entries(DIAL_CODES)
  .map(([code, dial]) => ({ code, dial, flag: flag(code) }))

export const isPhoneCountry = (code: string) => code in DIAL_CODES

/** Whether the field collects its phone number with a separate country selector. */
export const isCountryPhone = (field: Pick<FormField, 'type' | 'phone'>) => field.type === 'tel' && field.phone?.mode === 'country'

/** The countries a phone field offers, in the order of its `countries` allow-list (unknown codes dropped), or every country. */
export function phoneCountries(config?: PhoneConfig): PhoneCountry[] {
  const wanted = [...new Set(config?.countries?.map(code => code.toUpperCase()))]
  const list = wanted.flatMap(code => allPhoneCountries.find(country => country.code === code) ?? [])
  return list.length ? list : allPhoneCountries
}

/** The preselected country: `defaultCountry` when offered, else Denmark when offered, else the first one offered. */
export function defaultPhoneCountry(config?: PhoneConfig): string {
  const list = phoneCountries(config)
  const preferred = [config?.defaultCountry?.toUpperCase(), DEFAULT_PHONE_COUNTRY]
  return preferred.find(code => code && list.some(country => country.code === code)) ?? list[0]!.code
}

/** Localised country name, falling back to the ISO code. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  }
  catch {
    return code
  }
}

const digitsOf = (value: string) => value.replace(/\D/g, '')

/** Merges a country and the national number into the single stored value, e.g. `+4512345678`. Empty without digits. */
export function composePhone(country: string, national: string): string {
  const dial = DIAL_CODES[country]
  // A leading trunk `0` is not part of the international number (Italian numbers keep theirs).
  const digits = dial === '39' ? digitsOf(national) : digitsOf(national).replace(/^0+(?=\d)/, '')
  return dial && digits ? `+${dial}${digits}` : ''
}

/**
 * Splits a stored value back into country and national digits. Among the offered countries the longest
 * matching dialing code wins; `preferred` wins between countries sharing that code (`+1`, `+44`, ...).
 */
export function parsePhone(value: string, config?: PhoneConfig, preferred?: string): { country: string, national: string } {
  const fallback = preferred ?? defaultPhoneCountry(config)
  const digits = digitsOf(value)
  if (!value.trim().startsWith('+')) return { country: fallback, national: digits }
  const matches = phoneCountries(config)
    .filter(country => digits.startsWith(country.dial))
    .sort((a, b) => b.dial.length - a.dial.length)
  const longest = matches[0]
  if (!longest) return { country: fallback, national: digits }
  const chosen = matches.find(country => country.dial === longest.dial && country.code === preferred) ?? longest
  return { country: chosen.code, national: digits.slice(chosen.dial.length) }
}

/** Why a value is not an acceptable phone number for the field, or `undefined` when it is. */
export function phoneIssue(field: Pick<FormField, 'phone'>, value: string): 'format' | 'country' | undefined {
  if (field.phone?.mode !== 'country') return /^[+()\d\s-]{5,}$/.test(value) ? undefined : 'format'
  if (!/^\+\d+$/.test(value.replace(/[\s()-]/g, ''))) return 'format'
  const digits = digitsOf(value)
  if (digits.length > MAX_DIGITS) return 'format'
  const country = phoneCountries(field.phone).find(candidate => digits.startsWith(candidate.dial))
  if (!country) return 'country'
  return digits.length - country.dial.length >= MIN_NATIONAL_DIGITS ? undefined : 'format'
}
