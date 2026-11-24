import localProfile from 'local-profile'
import type { Answer, FieldPath } from '@src/shared/utils/types'
import { validateProfile, resolveProfile } from './profileResolver'
import { logEvent } from '../../executionLog'

const profile = validateProfile(localProfile.data, localProfile.error)
logEvent(profile.errors.length ? `Profile rejected: ${profile.errors.length} validation error(s). See profile status.` : `Profile loaded: ${profile.entries.length} populated entries.`, profile.errors.length ? 'error' : 'info')
export const profileStatus = () => ({ ready: profile.errors.length === 0, entryCount: profile.entries.length, errors: [...profile.errors] })
export const resolveAnswer = (path: FieldPath) => resolveProfile(profile, path)
export function getAnswers(path: FieldPath): Answer[] {
  const result = resolveAnswer(path)
  logEvent(result.status === 'matched' ? `Answer lookup: ${result.matchType} profile match.` : `Answer lookup skipped: ${result.reason}.`, result.status === 'matched' ? 'info' : 'warn')
  return result.status === 'matched' ? [{
    answer: result.value, path: { ...path }, profileEntryId: result.entryId,
    matchType: `Profile: ${result.matchType}`,
  }] : []
}
