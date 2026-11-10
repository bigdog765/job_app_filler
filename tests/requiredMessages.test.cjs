const assert = require('node:assert/strict')
const { test } = require('node:test')
const { JSDOM } = require('jsdom')
const loadTs = require('./helpers/loadTs.cjs')
const { isRequiredField } = loadTs('src/shared/utils/fieldRequirement.ts')

test('required message detection uses attributes and labels, not error colors', () => {
  const document = new JSDOM(`<label for="a">Name*</label><input id="a">
    <label for="b">Email*</label><input id="b" aria-required="false">
    <input id="c" required><div id="d" role="combobox" aria-required="true"></div>
    <label for="e" style="color:red">City</label><input id="e" aria-invalid="true">
    <fieldset><legend>Choice*</legend><input id="f" type="radio"></fieldset>`).window.document
  for (const [id, expected] of Object.entries({ a:true, b:false, c:true, d:true, e:false, f:true })) {
    assert.equal(isRequiredField(document.getElementById(id)), expected)
  }
})

test('optional fields still receive AI answers, but only missing required matches produce messages', async () => {
  let handler, result = null, calls = 0
  const statuses = []
  loadTs('src/background/background.ts', {
    'local-profile': {}, './profileMatcher': { candidatesFor: () => [{ id: 0 }],
      selectProfileEntry: async () => { calls++; return result } },
  }, { chrome: {
    runtime: { id: 'jaf', onMessage: { addListener(fn) { handler = fn } } },
    tabs: { onRemoved: { addListener() {} } },
    storage: { onChanged: { addListener() {} }, session: { remove: async () => {},
      get: async () => ({}), set: async value => statuses.push(value.openaiStatus) } },
  } })
  const send = (label, required) => new Promise(resolve => handler({ type: 'MATCH_PROFILE_OPENAI',
    path: { fieldName: label, fieldType: 'TextInput', section: 'Personal', required } },
    { id: 'jaf', tab: { id: 1 }, url: 'https://example.test' }, resolve))
  await send('Optional missing', false)
  assert.equal(statuses.length, 0)
  await send('Required missing', true)
  assert.equal(statuses.length, 1)
  assert.match(statuses[0], /Required missing.*Personal/)
  result = 0
  assert.deepEqual(await send('Optional found', false), { entryId: 0 })
  assert.deepEqual(await send('Required found', true), { entryId: 0 })
  assert.equal(statuses.length, 1)
  assert.equal(calls, 4)
})
