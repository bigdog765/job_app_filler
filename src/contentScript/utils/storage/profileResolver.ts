import type { FieldPath } from '@src/shared/utils/types'

export type ProfileValue = string | boolean | string[] | null
export type ProfileEntry = {
  id: string
  labels: string[]
  value: ProfileValue
  sections?: string[]
  fieldTypes?: string[]
  enabled?: boolean
}
export type Profile = { entries: ProfileEntry[]; errors: string[] }
export type Resolution =
  | { status: 'matched'; entryId: string; value: ProfileValue; matchType: 'exact' | 'semantic' }
  | { status: 'unmatched'; reason: 'invalid-profile' | 'invalid-field' | 'unsupported' | 'ambiguous' | 'no-match' }

const fieldTypes = ['TextInput', 'SimpleDropdown', 'MultiCheckbox', 'BooleanRadio', 'SingleCheckbox', 'Year', 'MonthYear']
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 &&
  value.every(item => typeof item === 'string' && item.trim().length > 0)
const populated = (value: ProfileValue) => value !== null &&
  (typeof value === 'boolean' || (typeof value === 'string' ? !!value.trim() : value.length > 0 && value.every(v => !!v.trim())))

export function validateProfile(data: unknown, loadError?: string): Profile {
  if (loadError) return { entries: [], errors: [loadError] }
  if (!data || typeof data !== 'object' || !Array.isArray((data as any).entries)) {
    return { entries: [], errors: ['Profile must contain an entries array.'] }
  }
  const errors: string[] = []
  const ids = new Set<string>()
  const entries: ProfileEntry[] = []
  ;(data as any).entries.forEach((entry: any, index: number) => {
    const error = (message: string) => errors.push(`Entry ${index + 1}: ${message}`)
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { error('must be an object.'); return }
    if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.id) || ids.has(entry.id)) {
      error('id must be a unique nonempty identifier (letters, digits, dots, underscores or hyphens).')
    } else ids.add(entry.id)
    if (!strings(entry.labels)) error('labels must be a nonempty list of nonempty strings.')
    if (entry.sections !== undefined && (!Array.isArray(entry.sections) || !entry.sections.length || !entry.sections.every(s => typeof s === 'string'))) error('sections must be a nonempty list of strings (empty string means no section).')
    if (entry.fieldTypes !== undefined && !strings(entry.fieldTypes)) error('fieldTypes must be a nonempty list of type names.')
    if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean') error('enabled must be a boolean.')
    if (!(entry.value === null || typeof entry.value === 'string' || typeof entry.value === 'boolean' ||
      (Array.isArray(entry.value) && entry.value.every(v => typeof v === 'string')))) error('value must be a string, boolean, string array, or null.')
    entries.push(entry)
  })
  // Reject the entire malformed document instead of silently using a partial profile.
  return { entries: errors.length ? [] : entries.filter(e => e.enabled !== false && populated(e.value)), errors }
}

export function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\*✱✳]/g, '')
    .replace(/\((required|optional)\)/g, '').trim().replace(/[:?]+$/g, '').replace(/\s+/g, ' ').trim()
}

// Deliberately bounded aliases: no substring/fuzzy matching of personal questions.
const meanings = [
  ['first name', 'given name', 'legal first name'],
  ['last name', 'family name', 'surname', 'legal last name'],
  ['email', 'email address'], ['phone', 'phone number', 'telephone number'],
  ['postal code', 'zip code', 'zip/postal code'],
  ['company', 'employer', 'company name', 'employer name', 'name of employer'],
  ['job title', 'role title', 'position title'],
  ['school', 'school name', 'university', 'university name'],
]
const meaning = (label: string) => meanings.findIndex(group => group.includes(normalize(label)))
function sectionKey(section: string): string {
  return normalize(section).replace(/^(employment history|employment|work history)(?=\s|$)/, 'work experience')
    .replace(/^education history(?=\s|$)/, 'education')
}

export function adaptValue(value: ProfileValue, type: string): ProfileValue | undefined {
  switch (type) {
    case 'TextInput': case 'BooleanRadio': return typeof value === 'string' && value.trim() ? value : undefined
    case 'SingleCheckbox': return typeof value === 'boolean' ? value : undefined
    case 'SimpleDropdown': case 'MultiCheckbox': return typeof value === 'string' && value.trim() ? [value] : strings(value) ? [...value] : undefined
    case 'Year': return typeof value === 'string' && /^\d{4}$/.test(value) ? value : undefined
    case 'MonthYear': return Array.isArray(value) && value.length === 2 && /^(0?[1-9]|1[0-2])$/.test(value[0]) && /^\d{4}$/.test(value[1]) ? [...value] : undefined
    default: return undefined
  }
}

export function resolveProfile(profile: Profile, path: FieldPath): Resolution {
  const none = (reason: Extract<Resolution, { status: 'unmatched' }>['reason']): Resolution => ({ status: 'unmatched', reason })
  if (profile.errors.length) return none('invalid-profile')
  if (!path || typeof path.fieldName !== 'string' || !path.fieldName.trim() || typeof path.section !== 'string' || typeof path.fieldType !== 'string') return none('invalid-field')
  const label = normalize(path.fieldName)
  if (!fieldTypes.includes(path.fieldType) || /\b(consent|agree|agreement|acknowledge|certify|certification|signature|password)\b/.test(label)) return none('unsupported')
  const section = sectionKey(path.section)
  const repeated = /^(work experience|education)(\s|$)/.test(section)
  const candidates = profile.entries.filter(entry =>
    (!entry.fieldTypes || entry.fieldTypes.includes(path.fieldType)) &&
    (entry.sections ? entry.sections.some(s => sectionKey(s) === section) : !repeated) &&
    // Date pairs must be explicitly scoped to avoid treating them as dropdown choices.
    (!Array.isArray(entry.value) || path.fieldType !== 'MonthYear' || entry.fieldTypes?.includes('MonthYear')) &&
    adaptValue(entry.value, path.fieldType) !== undefined)
  const exact = candidates.filter(entry => entry.labels.some(l => normalize(l) === label))
  const semantic = meaning(label)
  const matches = exact.length ? exact : candidates.filter(entry => semantic >= 0 && entry.labels.some(l => meaning(l) === semantic))
  if (!matches.length) return none('no-match')
  if (matches.length !== 1) return none('ambiguous')
  return { status: 'matched', entryId: matches[0].id, value: adaptValue(matches[0].value, path.fieldType), matchType: exact.length ? 'exact' : 'semantic' }
}
