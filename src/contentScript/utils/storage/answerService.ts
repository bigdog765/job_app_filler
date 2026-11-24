import localProfile from 'local-profile'
import type { Answer, FieldPath } from '@src/shared/utils/types'
import { validateProfile, resolveProfile } from './profileResolver'

const profile = validateProfile(localProfile.data, localProfile.error)
export const profileStatus = () => ({ ready: profile.errors.length === 0, entryCount: profile.entries.length, errors: [...profile.errors] })
export const resolveAnswer = (path: FieldPath) => resolveProfile(profile, path)
export function getAnswers(path: FieldPath): Answer[] {
  const result = resolveAnswer(path)
  return result.status === 'matched' ? [{
    answer: result.value, path: { ...path }, profileEntryId: result.entryId,
    matchType: `Profile: ${result.matchType}`,
  }] : []
}
