import { Server } from '@src/shared/utils/crossContextCommunication/server'
import { FieldPath } from '@src/shared/utils/types'
import { EVENT_LISTENER_ID, loadApp } from './app/App'
import { getAnswers, profileStatus } from './utils/storage/answerService'

// Regiser server and methods accessible to injected script.
const server = new Server(process.env.CONTENT_SCRIPT_URL)
// Legacy UI will be removed separately. It cannot mutate profile or saved data.
for (const method of ['addAnswer', 'saveAnswer', 'updateAnswer', 'deleteAnswer']) {
  server.register(method, async () => { throw new Error('Answers are read-only. Edit profile.local.json and rebuild/reload the extension.') })
}

server.register('getAnswer', async (fieldPath: FieldPath) => {
  return getAnswers(fieldPath)
})

// inject script
function injectScript(filePath: string) {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL(filePath)
  script.setAttribute('async', 'true')
  script.type = 'module'
  script.onload = function () {
    script.remove()
  }
  ;(document.head || document.documentElement).appendChild(script)
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PROFILE_STATUS') {
    sendResponse(profileStatus())
    return
  }
  if (message.type === 'SHOW_WHATS_NEW') {
    document.dispatchEvent(new CustomEvent(EVENT_LISTENER_ID))
  }
})

const run = async () => {
  injectScript('inject.js')
  loadApp()
}

run()
