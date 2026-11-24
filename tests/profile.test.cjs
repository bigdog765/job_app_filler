const { test } = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./helpers/loadTs.cjs')
const resolver = loadTs('src/contentScript/utils/storage/profileResolver.ts')
const { validateProfile, resolveProfile } = resolver
const entry = (overrides = {}) => ({ id: 'given-name', labels: ['First Name'], value: 'Ada', ...overrides })
const field = (overrides = {}) => ({ fieldName: 'First Name', section: '', fieldType: 'TextInput', ...overrides })
const match = (entries, path = field()) => resolveProfile(validateProfile({ entries }), path)

test('exact aliases normalize markers; semantic matching is whole-phrase only', () => {
  assert.equal(match([entry()], field({ fieldName: ' First   Name (required) ✱: ' })).matchType, 'exact')
  assert.equal(match([entry()], field({ fieldName: 'Given Name' })).matchType, 'semantic')
  for (const fieldName of ['Manager First Name', 'Not your First Name', 'Preferred First Name']) {
    assert.equal(match([entry()], field({ fieldName })).status, 'unmatched')
  }
})
test('exact matches beat synonyms; ambiguity never depends on array order', () => {
  const other = entry({ id: 'other', labels: ['Given Name'], value: 'Grace' })
  assert.equal(match([other, entry()]).entryId, 'given-name')
  const duplicate = entry({ id: 'duplicate', value: 'Grace' })
  for (const entries of [[entry(), duplicate], [duplicate, entry()]]) assert.equal(match(entries).reason, 'ambiguous')
  assert.equal(match([entry(), other], field({ fieldName: 'Legal First Name' })).reason, 'ambiguous')
})
test('invalid profiles fail closed without leaking values into diagnostics', () => {
  for (const data of [null, {}, { entries: [entry(), entry()] }, { entries: [entry({ value: { secret: 'PRIVATE' } })] },
    { entries: [entry({ labels: [] })] }, { entries: [entry({ fieldTypes: [] })] }]) {
    const profile = validateProfile(data)
    assert.ok(profile.errors.length)
    assert.equal(profile.entries.length, 0)
    assert.equal(resolveProfile(profile, field()).reason, 'invalid-profile')
    assert.ok(!JSON.stringify(profile.errors).includes('PRIVATE'))
  }
})
test('blank and disabled entries skipped; false is a real answer', () => {
  for (const value of ['', '  ', null, [], ['']]) assert.equal(match([entry({ value })]).reason, 'no-match')
  assert.equal(match([entry({ enabled: false })]).reason, 'no-match')
  assert.equal(match([entry({ value: false })], field({ fieldType: 'SingleCheckbox' })).value, false)
})
test('record scope preserves employment and education identities', () => {
  assert.equal(match([entry({ sections: [''] })]).status, 'matched')
  const one = entry({ id: 'job-one', labels: ['Company'], sections: ['Work Experience 1'], value: 'One' })
  const two = entry({ id: 'job-two', labels: ['Company'], sections: ['Work Experience 2'], value: 'Two' })
  assert.equal(match([one, two], field({ fieldName: 'Employer Name', section: 'Employment History 2' })).value, 'Two')
  for (const section of ['', 'Work Experience', 'Work Experience 3', 'Education 1']) {
    assert.equal(match([one, two], field({ fieldName: 'Company', section })).status, 'unmatched')
  }
  assert.equal(match([entry()], field({ section: 'Education 1' })).status, 'unmatched')
})
test('value shapes and field type restrictions are enforced', () => {
  assert.deepEqual(match([entry({ value: 'Yes' })], field({ fieldType: 'SimpleDropdown' })).value, ['Yes'])
  assert.equal(match([entry({ value: ['08', '2024'], fieldTypes: ['MonthYear'] })], field({ fieldType: 'MonthYear' })).status, 'matched')
  assert.equal(match([entry({ value: ['13', '2024'], fieldTypes: ['MonthYear'] })], field({ fieldType: 'MonthYear' })).status, 'unmatched')
  assert.equal(match([entry({ value: ['08', '2024'] })], field({ fieldType: 'MonthYear' })).status, 'unmatched')
  assert.equal(match([entry({ value: ['Ada'] })]).status, 'unmatched')
  assert.equal(match([entry({ fieldTypes: ['SimpleDropdown'] })]).status, 'unmatched')
  assert.equal(match([entry({ fieldTypes: ['FutureUnsupportedType'] })]).status, 'unmatched')
})
test('unsupported and invalid requests return explicit no-match', () => {
  for (const fieldType of ['PasswordInput', 'SingleFileUpload', 'MonthDayYear', 'unknown']) assert.equal(match([entry()], field({ fieldType })).reason, 'unsupported')
  assert.equal(match([entry({ labels: ['I agree'], value: true })], field({ fieldName: 'I agree', fieldType: 'SingleCheckbox' })).reason, 'unsupported')
  for (const path of [null, {}, field({ fieldName: '' })]) assert.equal(match([entry()], path).reason, 'invalid-field')
})
test('answer service and content bridge use profile only and never touch Chrome storage', async () => {
  const service = loadTs('src/contentScript/utils/storage/answerService.ts', {
    'local-profile': { data: { entries: [entry()] }, error: null }, './profileResolver': resolver,
  })
  const methods = {}
  let listener
  loadTs('src/contentScript/contentScript.ts', {
    '@src/shared/utils/crossContextCommunication/server': { Server: class { register(name, fn) { methods[name] = fn } } },
    './app/App': { EVENT_LISTENER_ID: 'test', loadApp() {} },
    './utils/storage/answerService': service,
  }, {
    chrome: { runtime: { getURL: x => x, onMessage: { addListener: fn => { listener = fn } } }, storage: new Proxy({}, { get() { throw new Error('Storage accessed') } }) },
    document: { createElement: () => ({ setAttribute() {} }), head: { appendChild() {} } },
  })
  assert.equal((await methods.getAnswer(field()))[0].answer, 'Ada')
  assert.deepEqual(await methods.getAnswer(field({ fieldName: 'Unknown' })), [])
  for (const name of ['addAnswer', 'saveAnswer', 'updateAnswer', 'deleteAnswer']) await assert.rejects(methods[name]({}), /read-only/)
  let status
  listener({ type: 'GET_PROFILE_STATUS' }, {}, value => { status = value })
  assert.deepEqual(status, { ready: true, entryCount: 1, errors: [] })
  assert.ok(!JSON.stringify(status).includes('Ada'))
})
