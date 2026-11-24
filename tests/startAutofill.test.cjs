const { test } = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./helpers/loadTs.cjs')

test('autofill runs after construction, without a widget, and reports completion', async () => {
  const events = []
  const { startAutofill } = loadTs('src/inject/app/services/startAutofill.ts', {
    './contentScriptApi': { contentScriptAPI: { send: async (_, data) => events.push(data.event) } },
  })
  let initialized = false
  let fills = 0
  const task = startAutofill({ async fill() { assert.equal(initialized, true); fills++ } })
  assert.equal(fills, 0)
  initialized = true
  await task
  assert.equal(fills, 1)
  assert.deepEqual(events, ['start', 'complete'])
})

test('autofill failures are reported without exposing raw errors or rejecting initialization', async () => {
  const events = []
  const { startAutofill } = loadTs('src/inject/app/services/startAutofill.ts', {
    './contentScriptApi': { contentScriptAPI: { send: async (_, data) => events.push(data) } },
  })
  await startAutofill({ async fill() { throw new Error('private details') } })
  assert.deepEqual(events, [{ event: 'start' }, { event: 'error' }])
})
