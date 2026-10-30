import type { Answer, FieldPath } from '@src/shared/utils/types'

// Match whole labels only: fuzzy matches can put personal data in unrelated fields.
const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/\(\s*(required|optional)\s*\)/g, '')
  .replace(/\s*\/\s*/g, '/')
  .replace(/[\s*:✱✲✳∗⁎]+/g, ' ').trim()

const stringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function adaptValue(value: unknown, fieldType: string): unknown {
  switch (fieldType) {
    case 'Year':
      return typeof value === 'string' && /^[1-9]\d{3}$/.test(value) ? value : undefined
    case 'MonthYear':
      return stringList(value) && value.length === 2 &&
        /^(0?[1-9]|1[0-2])$/.test(value[0]) && /^[1-9]\d{3}$/.test(value[1])
        ? [...value] : undefined
    case 'TextInput':
    case 'BooleanRadio':
      return typeof value === 'string' && value.trim() ? value : undefined
    case 'SimpleDropdown':
    case 'MultiSelect':
    case 'MultiCheckbox': {
      const values = typeof value === 'string' ? [value] : value
      return stringList(values) && values.length > 0 && values.every((v) => v.trim())
        ? [...values] : undefined
    }
    case 'SingleCheckbox':
      return typeof value === 'boolean' ? value : undefined
    default:
      return undefined
  }
}

/** Keep Chrome's existing matching behavior; consult the profile only on a miss. */
export function answersWithProfileFallback(
  storedAnswers: Answer[], path: FieldPath, profile: unknown
): Answer[] {
  if (storedAnswers.length > 0) return storedAnswers
  if (!profile || typeof profile !== 'object' ||
      !('entries' in profile) || !Array.isArray(profile.entries)) return []
  if (!path || typeof path.fieldName !== 'string' || !normalize(path.fieldName)) return []

  for (const entry of profile.entries) {
    if (!entry || typeof entry !== 'object' || entry.enabled === false) continue
    if (!stringList(entry.labels) ||
        !entry.labels.some((label) => normalize(label) === normalize(path.fieldName))) continue
    if (entry.sections !== undefined && (!stringList(entry.sections) ||
        !entry.sections.some((section) => normalize(section) === normalize(path.section || '')))) continue
    if (entry.fieldTypes !== undefined && (!stringList(entry.fieldTypes) ||
        !entry.fieldTypes.includes(path.fieldType))) continue

    const answer = adaptValue(entry.value, path.fieldType)
    if (answer !== undefined) {
      return [{ answer, path: { ...path }, source: 'localProfile', matchType: 'local profile' }]
    }
  }
  return []
}
