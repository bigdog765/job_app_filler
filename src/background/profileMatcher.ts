import { FieldPath } from '@src/shared/utils/types'
import { adaptValue } from '@src/contentScript/utils/storage/profileFallback'
import { sectionMeaning } from '@src/shared/utils/profileSemantics'

export function candidatesFor(path: FieldPath, profile: any) {
  if (!path || typeof path.fieldName !== 'string' || !path.fieldName.trim() ||
      path.fieldName.length > 2000 || typeof path.section !== 'string' || path.section.length > 500) return []
  return (Array.isArray(profile?.entries) ? profile.entries : []).flatMap((entry: any, id: number) => {
    if (!entry || entry.enabled === false || !Array.isArray(entry.labels) ||
        !entry.labels.length || !entry.labels.every((label: any) => typeof label === 'string') ||
        (entry.sections !== undefined && (!Array.isArray(entry.sections) ||
          !entry.sections.every((section: any) => typeof section === 'string') ||
          !entry.sections.some((section: string) => sectionMeaning(section).toLowerCase() === sectionMeaning(path.section).toLowerCase()))) ||
        (entry.fieldTypes !== undefined && (!Array.isArray(entry.fieldTypes) || !entry.fieldTypes.includes(path.fieldType))) ||
        adaptValue(entry.value, path.fieldType) === undefined) return []
    return [{ id, labels: entry.labels, sections: entry.sections || [] }]
  })
}

export async function selectProfileEntry(path: FieldPath, candidates: ReturnType<typeof candidatesFor>,
  request: typeof fetch = fetch): Promise<number | null> {
  if (!candidates.length) return null
  const response = await request('http://127.0.0.1:43187/match', {
    method: 'POST', signal: AbortSignal.timeout(28000),
    headers: { Authorization: 'Bearer ' + process.env.JAF_BRIDGE_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ field: { fieldName: path.fieldName, section: path.section, fieldType: path.fieldType }, candidates }),
  })
  if (!response.ok) throw new Error('Local AI service failed (HTTP ' + response.status + '). Check npm run ai:server and OPENAI_API_KEY.')
  const { entryId } = await response.json()
  if (entryId !== null && (!Number.isInteger(entryId) || !candidates.some(candidate => candidate.id === entryId))) {
    throw new Error('Local AI service returned an invalid profile entry.')
  }
  return entryId
}
