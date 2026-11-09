import { FieldPath, Answer } from '@src/shared/utils/types'
import { adaptValue } from './profileFallback'

export async function aiProfileAnswer(path: FieldPath, profile: any): Promise<Answer[]> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'MATCH_PROFILE_OPENAI', path })
    if (!Number.isInteger(result?.entryId)) return []
    const entry = profile?.entries?.[result.entryId]
    if (!entry || entry.enabled === false ||
        (entry.fieldTypes && !entry.fieldTypes.includes(path.fieldType))) return []
    const answer = adaptValue(entry.value, path.fieldType)
    return answer === undefined ? [] : [{ answer, path: { ...path }, source: 'localProfile', matchType: 'AI profile match' }]
  } catch { return [] }
}
