import { answers1010, migrate1010 } from './Answers1010'
import { convert106To1010, convert1010To106 } from './DataStore'
import { SavedAnswer } from './DataStoreTypes'
import { migrateEducation } from './migrateEducationSectionNames'
import localProfile from 'local-profile'
import { answersWithProfileFallback } from './profileFallback'
import { profileSuggestion } from './profileSuggestions'
import { aiProfileAnswer } from './aiProfile'

let ready: Promise<void>
export function prepareAnswers(): Promise<void> {
  if (!ready) ready = (async () => {
    await migrate1010()
    await migrateEducation()
    await answers1010.load()
  })()
  return ready
}

export async function answerRequest(method: string, data: any): Promise<any> {
  if (method === 'getProfileSuggestion') {
    const local = profileSuggestion(data, localProfile)
    return local !== undefined ? local : (await aiProfileAnswer(data, localProfile))[0]?.answer
  }
  await prepareAnswers()
  switch (method) {
    case 'addAnswer':
    case 'saveAnswer':
      return convert1010To106(answers1010.add(convert106To1010(data)))
    case 'updateAnswer':
      return convert1010To106(answers1010.update(convert106To1010(data) as SavedAnswer))
    case 'getAnswer': {
      const local = answersWithProfileFallback(answers1010.search(data).map(convert1010To106), data, localProfile)
      if (local.length) return local
      const inferred = profileSuggestion(data, localProfile)
      if (inferred !== undefined) return [{ answer: inferred, path: { ...data }, source: 'localProfile', matchType: 'local profile' }]
      return aiProfileAnswer(data, localProfile)
    }
    case 'deleteAnswer':
      return answers1010.delete(data)
    default:
      throw new Error('Unknown answer operation')
  }
}
