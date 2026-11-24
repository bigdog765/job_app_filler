import { Server } from '@src/shared/utils/crossContextCommunication/server'
import { FieldPath } from '@src/shared/utils/types'
import { EVENT_LISTENER_ID, loadApp } from './app/App'
import { getAnswers, profileStatus } from './utils/storage/answerService'
import { logEvent, getExecutionLog, clearExecutionLog } from './executionLog'

// Regiser server and methods accessible to injected script.
const server = new Server(process.env.CONTENT_SCRIPT_URL)
logEvent('Content script started; profile answer bridge ready.')
server.register('reportExecutionEvent', async (data) => {
  const messages = { start: 'Field fill requested.', complete: 'Field fill routine completed (may skip unmatched fields).', error: 'Field fill failed.' }
  if (data && Object.prototype.hasOwnProperty.call(messages, data.event)) logEvent(messages[data.event], data.event === 'error' ? 'error' : 'info')
})
// Legacy UI will be removed separately. It cannot mutate profile or saved data.
for (const method of ['addAnswer', 'saveAnswer', 'updateAnswer', 'deleteAnswer']) {
  server.register(method, async () => { logEvent('Legacy answer write blocked: profile is read-only.', 'warn'); throw new Error('Answers are read-only. Edit profile.local.json and rebuild/reload the extension.') })
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
    logEvent('Page adapter script loaded.')
    script.remove()
  }
  script.onerror = () => logEvent('Page adapter script could not load.', 'error')
  ;(document.head || document.documentElement).appendChild(script)
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_EXECUTION_LOG') { sendResponse(getExecutionLog()); return }
  if (message.type === 'CLEAR_EXECUTION_LOG') { clearExecutionLog(); sendResponse({ ok: true }); return }
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
