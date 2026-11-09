const assert = require('node:assert/strict')
const { test } = require('node:test')
const { once } = require('node:events')
const { createBridgeServer } = require('../server/index.cjs')
const loadTs = require('./helpers/loadTs.cjs')
const fallback = loadTs('src/contentScript/utils/storage/profileFallback.ts')
const semantics = loadTs('src/shared/utils/profileSemantics.ts')
const field = { fieldName: 'Email?', section: '', fieldType: 'TextInput' }
const candidates = [{ id: 0, labels: ['Email'], sections: [] }]

test('local bridge authenticates, fixes the model, strips answer values, and completes the extension request', async () => {
  let calls = 0
  const server = createBridgeServer({ apiKey: 'server-only-key', token: 'paired-test-token', request: async (url, init) => {
    calls++
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(init.headers.Authorization, 'Bearer server-only-key')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'gpt-6-luna')
    assert.ok(!init.body.includes('secret-value'))
    assert.equal(body.store, false)
    return { ok: true, json: async () => ({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: '{"entryId":0}' }] },
    ] }) }
  } })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/match`
  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401)
    const headers = { Authorization: 'Bearer paired-test-token', 'Content-Type': 'application/json' }
    assert.equal((await fetch(url, { method: 'POST', headers, body: '{}' })).status, 400)
    const { selectProfileEntry } = loadTs('src/background/profileMatcher.ts', {
      '@src/contentScript/utils/storage/profileFallback': fallback,
      '@src/shared/utils/profileSemantics': semantics,
    }, { process: { env: { JAF_BRIDGE_TOKEN: 'paired-test-token' } } })
    assert.equal(await selectProfileEntry(field, candidates, async (target, init) => {
      assert.equal(target, 'http://127.0.0.1:43187/match')
      assert.ok(!JSON.stringify(init).includes('server-only-key'))
      return fetch(url, init)
    }), 0)
    const result = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ field,
      model: 'arbitrary-model', candidates: [{ ...candidates[0], value: 'secret-value' }] }) })
    assert.deepEqual(await result.json(), { entryId: 0 })
    assert.equal(result.headers.get('access-control-allow-origin'), null)
    assert.equal(calls, 2)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('bridge reports missing credentials without calling OpenAI', async () => {
  const server = createBridgeServer({ apiKey: '', token: 'test', request: () => assert.fail('must not fetch') })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/match`, {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, candidates }),
    })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'OPENAI_API_KEY is not set' })
  } finally { await new Promise(resolve => server.close(resolve)) }
})
