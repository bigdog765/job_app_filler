import { answers1010, migrate1010 } from './Answers1010'
import { convert106To1010, convert1010To106 } from './DataStore'
import { SavedAnswer } from './DataStoreTypes'
import { migrateEducation } from './migrateEducationSectionNames'
import localProfile from 'local-profile'
import { answersWithProfileFallback } from './profileFallback'
import { profileSuggestion } from './profileSuggestions'

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
  if (method === 'getProfileSuggestion') return profileSuggestion(data, localProfile)
  await prepareAnswers()
  switch (method) {
    case 'addAnswer':
    case 'saveAnswer':
      return convert1010To106(answers1010.add(convert106To1010(data)))
    case 'updateAnswer':
      return convert1010To106(answers1010.update(convert106To1010(data) as SavedAnswer))
    case 'getAnswer':
      return answersWithProfileFallback(answers1010.search(data).map(convert1010To106), data, localProfile)
    case 'deleteAnswer':
      return answers1010.delete(data)
    default:
      throw new Error('Unknown answer operation')
  }
}
