import localProfile from 'local-profile'
import { candidatesFor, selectProfileEntry } from './profileMatcher'

// Remove credentials left by the previous popup-based configuration.
chrome.storage.session.remove('openaiConfig')
let generation = 0
const lanes: Promise<any>[] = Array.from({ length: 4 }, () => Promise.resolve())
let nextLane = 0
const cache = new Map<string, Promise<number | null>>()
const budgets = new Map<number, number>()
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && (changes.openaiEnabled || changes.openaiReset)) {
    generation++; cache.clear(); budgets.clear()
  }
})
chrome.tabs.onRemoved.addListener(id => budgets.delete(id))

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'MATCH_PROFILE_OPENAI' || sender.id !== chrome.runtime.id ||
      !sender.tab || !/^https?:\/\//.test(sender.url || '')) return
  const path = message.path
  const requestGeneration = generation;
  const reportMissing = async (message: string) => {
    if (path?.required !== true || generation !== requestGeneration ||
        typeof path.fieldName !== 'string' || typeof path.section !== 'string') return
    const label = path.fieldName.trim().replace(/\s+/g, ' ')
    const section = path.section.trim().replace(/\s+/g, ' ')
    await chrome.storage.session.set({ openaiStatus:
      `${message} Required field: “${label}”${section ? ` (section: ${section})` : ''}.` })
  };
  (async () => {
    const { openaiEnabled } = await chrome.storage.session.get('openaiEnabled')
    if (openaiEnabled === false) return { entryId: null }
    const candidates = candidatesFor(path, localProfile)
    if (!candidates.length) {
      await reportMissing('No eligible profile entry.')
      return { entryId: null }
    }
    const key = JSON.stringify([path.fieldName, path.section, path.fieldType])
    if (!cache.has(key)) {
      const tabId = sender.tab.id
      const used = budgets.get(tabId) || 0
      if (used >= 100 || cache.size >= 500) throw new Error('AI matching session limit reached. Reset matching in the popup to reset it.')
      budgets.set(tabId, used + 1)
      const lane = nextLane++ % lanes.length
      const queuedAt = Date.now()
      const pending = lanes[lane].then(async () => {
        if (generation !== requestGeneration) return null
        if (Date.now() - queuedAt > 30000) throw new Error('AI matching is busy. Reset matching in the popup, then refresh to retry.')
        return selectProfileEntry(path, candidates)
      })
      lanes[lane] = pending.catch(() => {})
      cache.set(key, pending)
    }
    const entryId = await cache.get(key)
    if (generation !== requestGeneration) return { entryId: null }
    if (entryId === null) await reportMissing('No confident profile match.')
    return { entryId }
  })().then(sendResponse).catch(async (error) => {
    // Do not include response bodies, prompts, or credentials in logs/errors.
    const status = error?.name === 'TimeoutError' ? 'OpenAI request timed out.' :
      error instanceof TypeError ? 'Local AI service unavailable. Start npm run ai:server, reset matching, and refresh.' :
      error instanceof SyntaxError ? 'OpenAI returned an unreadable match.' : error.message || 'OpenAI matching failed.'
    await reportMissing(status)
    sendResponse({ entryId: null })
  })
  return true
})
