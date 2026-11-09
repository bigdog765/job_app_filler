const assert = require('node:assert/strict')
const { test } = require('node:test')
const loadTs = require('./helpers/loadTs.cjs')
const fallback = loadTs('src/contentScript/utils/storage/profileFallback.ts')
const semantics = loadTs('src/shared/utils/profileSemantics.ts')
const { candidatesFor, selectProfileEntry: selectViaBridge } = loadTs('src/background/profileMatcher.ts', {
  '@src/contentScript/utils/storage/profileFallback': fallback,
  '@src/shared/utils/profileSemantics': semantics,
})
const { selectProfileEntry } = require('../server/openaiMatcher.cjs')
const field = { fieldName: 'How can we reach you by email?', section: '', fieldType: 'TextInput' }
const profile = { entries: [{ labels: ['Email address'], value: 'private@example.test' }] }
const config = { apiKey: 'test-key', model: 'ignored-model' }
const reply = entryId => ({ ok: true, json: async () => ({ status: 'completed', output: [
  { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ entryId }) }] },
] }) })

test('AI request sends only matching metadata, uses fixed gpt-6-luna model and validates the chosen ID', async () => {
  const candidates = candidatesFor(field, profile)
  const id = await selectProfileEntry(field, candidates, config, async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-6-luna')
    assert.equal(body.store, false)
    assert.equal(body.text.format.strict, true)
    assert.ok(!init.body.includes('private@example.test'))
    assert.ok(!init.body.includes(config.apiKey))
    assert.equal(init.headers.Authorization, 'Bearer test-key')
    assert.deepEqual(JSON.parse(body.input).candidates, [{ id: 0, labels: ['Email address'], sections: [] }])
    return reply(0)
  })
  assert.equal(id, 0)
  assert.equal(await selectProfileEntry(field, candidates, config, async () => reply(null)), null)
  await assert.rejects(selectProfileEntry(field, candidates, config, async () => reply(999)), /invalid/)
})

test('candidate eligibility enforces enabled entries, compatible types, nonblank values and record sections', () => {
  const profile = { entries: [
    { labels: ['Job Title'], sections: ['Work Experience 1'], value: 'first' },
    { labels: ['Job Title'], sections: ['Work Experience 2'], value: 'second' },
    { labels: ['Email'], value: 'disabled', enabled: false },
    { labels: ['Email'], value: '' },
    { labels: ['Email'], value: 'x', fieldTypes: ['SimpleDropdown'] },
    { labels: ['Resume'], value: { content: 'file' } },
  ] }
  assert.deepEqual(candidatesFor({ ...field, section: 'Employment history 2' }, profile).map(c => c.id), [1])
  assert.deepEqual(candidatesFor({ ...field, fieldType: 'SingleFileUpload' }, profile), [])
  assert.deepEqual(candidatesFor(null, profile), [])
})

test('API errors, incomplete output, and refusals cannot become profile choices', async () => {
  const candidates = candidatesFor(field, profile)
  await assert.rejects(selectProfileEntry(field, candidates, config, async () => ({ ok: false, status: 401 })), /HTTP 401/)
  await assert.rejects(selectProfileEntry(field, candidates, config, async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) })), /complete/)
  await assert.rejects(selectProfileEntry(field, candidates, config, async () => ({ ok: true, json: async () => ({ status: 'completed', output: [] }) })), /invalid/)
  assert.equal(await selectProfileEntry(field, [], config, () => { throw Error('must not fetch') }), null)
})

test('the content-side resolver fills original values and handles disabled AI or unavailable background', async () => {
  let result = { entryId: 0 }
  const { aiProfileAnswer } = loadTs('src/contentScript/utils/storage/aiProfile.ts', {
    './profileFallback': fallback,
  }, { chrome: { runtime: { sendMessage: async () => result } } })
  assert.equal((await aiProfileAnswer(field, profile))[0].answer, 'private@example.test')
  result = { entryId: null }
  assert.deepEqual(await aiProfileAnswer(field, profile), [])
  result = { entryId: 999 }
  assert.deepEqual(await aiProfileAnswer(field, profile), [])
})

test('answer service preserves local answers and uses AI only for unresolved fields', async () => {
  let calls = 0
  const { answerRequest } = loadTs('src/contentScript/utils/storage/answerService.ts', {
    './Answers1010': { migrate1010: async () => {}, answers1010: { load: async () => {}, search: () => [] } },
    './DataStore': { convert1010To106: x => x }, './DataStoreTypes': {},
    './migrateEducationSectionNames': { migrateEducation: async () => {} },
    'local-profile': profile, './profileFallback': fallback,
    './profileSuggestions': { profileSuggestion: () => undefined },
    './aiProfile': { aiProfileAnswer: async () => { calls++; return [{ answer: 'private@example.test' }] } },
  })
  assert.equal((await answerRequest('getAnswer', { ...field, fieldName: 'Email address' }))[0].answer, 'private@example.test')
  assert.equal(calls, 0)
  assert.equal((await answerRequest('getAnswer', field))[0].answer, 'private@example.test')
  assert.equal(await answerRequest('getProfileSuggestion', field), 'private@example.test')
  assert.equal(calls, 2)
})

test('background restricts callers, deduplicates requests, and invalidates pending matches on disconnect', async () => {
  let handler, changed, resolveMatch, calls = 0
  let enabled = true
  const chrome = {
    runtime: { id: 'extension-id', onMessage: { addListener(fn) { handler = fn } } },
    tabs: { onRemoved: { addListener() {} } },
    storage: {
      onChanged: { addListener(fn) { changed = fn } },
      session: { get: async () => ({ openaiEnabled: enabled }), set: async () => {}, remove: async () => {} },
    },
  }
  loadTs('src/background/background.ts', {
    'local-profile': profile,
    './profileMatcher': { candidatesFor, selectProfileEntry: async () => {
      calls++; return new Promise(resolve => { resolveMatch = resolve })
    } },
  }, { chrome })
  const message = { type: 'MATCH_PROFILE_OPENAI', path: field }
  assert.equal(handler(message, { id: 'other', tab: { id: 1 }, url: 'https://example.test' }, () => assert.fail()), undefined)
  const sender = { id: 'extension-id', tab: { id: 1 }, url: 'https://example.test' }
  const first = new Promise(resolve => handler(message, sender, resolve))
  const second = new Promise(resolve => handler(message, sender, resolve))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls, 1)
  enabled = false
  changed({ openaiEnabled: {} }, 'session')
  resolveMatch(0)
  assert.deepEqual(await first, { entryId: null })
  assert.deepEqual(await second, { entryId: null })
  assert.deepEqual(await new Promise(resolve => handler(message, sender, resolve)), { entryId: null })
  assert.equal(calls, 1)
})

