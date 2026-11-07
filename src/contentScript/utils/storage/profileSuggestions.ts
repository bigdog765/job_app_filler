import { FieldPath } from '@src/shared/utils/types'
import { fieldMeaning, sectionMeaning } from '@src/shared/utils/profileSemantics'
import { answersWithProfileFallback } from './profileFallback'

/** Explicit review uses the current local profile, independently of Chrome history. */
export function profileSuggestion(path: FieldPath, profile: any) {
  const canonical = { ...path, section: sectionMeaning(path.section),
    fieldName: fieldMeaning(path.fieldName, path.section) }
  const entries = Array.isArray(profile?.entries) ? profile.entries.filter((entry: any) =>
    entry && Array.isArray(entry.labels) && entry.labels.every((label: any) => typeof label === 'string') &&
    (entry.sections === undefined || (Array.isArray(entry.sections) && entry.sections.every((section: any) => typeof section === 'string')))
  ).map((entry: any) => ({
    ...entry,
    labels: Array.isArray(entry?.labels) ? entry.labels.map((label: string) =>
      fieldMeaning(label, entry.sections?.[0] || '')) : [],
    ...(Array.isArray(entry?.sections) && { sections: entry.sections.map(sectionMeaning) }),
  })) : []
  // Conflicting profile entries must not silently select an arbitrary answer.
  const matches = entries.flatMap((entry: any) => answersWithProfileFallback([], canonical, { entries: [entry] }))
  const values = new Set(matches.map((answer: any) => JSON.stringify(answer.answer)))
  return values.size === 1 ? matches[0]?.answer : undefined
}
