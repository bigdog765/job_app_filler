import './publicPath'
import { startAcknowledgments } from './acknowledgments'
import { Server } from '@src/shared/utils/crossContextCommunication/server'
import { getSiteAdapter } from '@src/shared/utils/siteAdapter'
import { EVENT_LISTENER_ID, loadApp } from './app/App'
import { answerRequest, prepareAnswers } from './utils/storage/answerService'
import { startGenericForms } from '@src/inject/app/services/formFields/generic'
import { setLocalTransport } from '@src/inject/app/services/contentScriptApi'
import { createProfileReview } from '@src/inject/app/services/formFields/generic/profileReview'
import { createProfileAutofill } from '@src/inject/app/services/formFields/generic/profileAutofill'

const specialized = getSiteAdapter(window.location.hostname) !== 'generic'
const acknowledgments = startAcknowledgments(document, specialized)
let generic: ReturnType<typeof startGenericForms>
let appLoaded = false
const profileReview = createProfileReview(document, (path) => answerRequest('getProfileSuggestion', path))
function ensureApp() {
  if (!appLoaded) { loadApp(); appLoaded = true }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REVIEW_PROFILE' || message.type === 'APPLY_PROFILE_UPDATES') {
    if (specialized) { sendResponse({ ok: false, specialized: true }); return }
    Promise.resolve().then(async () => {
      if (message.type === 'REVIEW_PROFILE') {
        await generic.enable()
        return profileReview.scan()
      }
      return profileReview.apply(Array.isArray(message.ids) ? message.ids : [])
    })
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }
  if (message.type === 'SHOW_WHATS_NEW') {
    ensureApp()
    setTimeout(() => document.dispatchEvent(new CustomEvent(EVENT_LISTENER_ID)), 100)
    sendResponse({ ok: true })
  }
  if (message.type === 'ENABLE_GENERIC_FORM') {
    acknowledgments.enable()
    if (specialized) {
      sendResponse({ ok: true, specialized: true })
    } else {
      generic.enable().then((count) => sendResponse({ ok: true, count }))
        .catch(() => sendResponse({ ok: false }))
      return true
    }
  }
})

async function run() {
  if (!specialized) {
    setLocalTransport(answerRequest)
    generic = startGenericForms(document, prepareAnswers,
      createProfileAutofill(document, (path) => answerRequest('getProfileSuggestion', path)))
    return
  }
  // Only ATS host patterns need page-context access to React internals.
  const server = new Server(process.env.CONTENT_SCRIPT_URL)
  for (const method of ['addAnswer', 'saveAnswer', 'updateAnswer', 'getAnswer', 'deleteAnswer']) {
    server.register(method, (data) => answerRequest(method, data))
  }
  await prepareAnswers()
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('inject.js')
  script.type = 'module'
  script.onload = () => script.remove()
  ;(document.head || document.documentElement).appendChild(script)
  ensureApp()
}

run().catch(console.error)
