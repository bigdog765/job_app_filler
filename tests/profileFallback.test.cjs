const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Exercise the actual TypeScript without introducing another test framework.
function loadTs(relativePath, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (!(name in imports)) throw new Error(`Unexpected runtime import: ${name}`)
    return imports[name]
  })
  return exports
}

const { answersWithProfileFallback: resolve } = loadTs(
  'src/contentScript/utils/storage/profileFallback.ts'
)
const field = { fieldName: 'Email', fieldType: 'TextInput', section: '' }
const profile = { entries: [{ labels: ['Email', 'Email Address'], value: 'test@example.test' }] }

test('Chrome matches, including similar matches and false values, always win', () => {
  const saved = [{ id: 0, answer: false, path: field, matchType: 'Similar: 1' }]
  assert.equal(resolve(saved, field, profile), saved)
})

test('normalizes case, spacing, required markers and aliases without fuzzy matching', () => {
  const matched = resolve([], { ...field, fieldName: ' EMAIL   ADDRESS (required): * ' }, profile)
  assert.equal(matched[0].answer, 'test@example.test')
  assert.equal(matched[0].source, 'localProfile')
  assert.equal(matched[0].id, undefined)
  assert.deepEqual(resolve([], { ...field, fieldName: 'Manager Email' }, profile), [])
  assert.equal(resolve([], { ...field, fieldName: 'State / Province *' }, {
    entries: [{ labels: ['State/Province'], value: 'Example State' }],
  })[0].answer, 'Example State')
  for (const marker of ['✱', '✲', '✳', '∗', '⁎', '*']) {
    assert.equal(resolve([], { ...field, fieldName: `Email${marker}` }, profile)[0].answer, 'test@example.test')
    assert.deepEqual(resolve([], { ...field, fieldName: `Manager Email${marker}` }, profile), [])
  }
})

test('missing, malformed, disabled and blank profiles leave fields unanswered', () => {
  for (const value of [null, {}, { entries: null }, { entries: [null, {}] }]) {
    assert.deepEqual(resolve([], field, value), [])
  }
  for (const value of ['', '  ', null, [], [''], 0, {}]) {
    assert.deepEqual(resolve([], field, { entries: [{ labels: ['Email'], value }] }), [])
  }
  assert.deepEqual(resolve([], field, {
    entries: [{ ...profile.entries[0], enabled: false }],
  }), [])
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, '../profile.example.json'), 'utf8'))
  for (const entry of template.entries) {
    assert.deepEqual(resolve([], { ...field, fieldName: entry.labels[0] }, template), [])
  }
})

test('section and field-type restrictions prevent unrelated matches', () => {
  const restricted = { entries: [{ ...profile.entries[0], sections: ['Personal'], fieldTypes: ['TextInput'] }] }
  assert.deepEqual(resolve([], field, restricted), [])
  assert.equal(resolve([], { ...field, section: 'PERSONAL' }, restricted).length, 1)
  assert.deepEqual(resolve([], { ...field, section: 'Personal', fieldType: 'SimpleDropdown' }, restricted), [])
})

test('adapts dropdown values and returns fresh arrays for destructive fill adapters', () => {
  const dropdown = { ...field, fieldType: 'SimpleDropdown' }
  assert.deepEqual(resolve([], dropdown, profile)[0].answer, ['test@example.test'])
  const alternatives = { entries: [{ labels: ['Email'], value: ['One', 'Two'] }] }
  resolve([], dropdown, alternatives)[0].answer.shift()
  assert.deepEqual(resolve([], dropdown, alternatives)[0].answer, ['One', 'Two'])
  assert.deepEqual(resolve([], field, alternatives), [])
})

test('preserves false checkbox answers and rejects incompatible or unsupported types', () => {
  const boolProfile = { entries: [{ labels: ['Email'], value: false }] }
  assert.equal(resolve([], { ...field, fieldType: 'SingleCheckbox' }, boolProfile)[0].answer, false)
  assert.deepEqual(resolve([], field, boolProfile), [])
  for (const fieldType of ['PasswordInput', 'SingleFileUpload', 'MonthYear', 'Unknown']) {
    assert.deepEqual(resolve([], { ...field, fieldType }, profile), [])
  }
})

test('the first compatible populated entry wins', () => {
  const entries = [{ labels: ['Email'], value: '' }, ...profile.entries,
    { labels: ['Email'], value: 'second@example.test' }]
  assert.equal(resolve([], field, { entries })[0].answer, 'test@example.test')
})

test('month/year and year answers preserve date precision and reject invalid dates', () => {
  const dateField = { fieldName: 'From', fieldType: 'MonthYear', section: 'Education 1' }
  const dateProfile = (value) => ({ entries: [
    { labels: ['From'], value, sections: ['Education 1'], fieldTypes: ['MonthYear'] },
  ] })
  const dates = dateProfile(['08', '2019'])
  assert.deepEqual(resolve([], dateField, dates)[0].answer, ['08', '2019'])
  resolve([], dateField, dates)[0].answer[0] = '01'
  assert.deepEqual(resolve([], dateField, dates)[0].answer, ['08', '2019'])
  assert.deepEqual(resolve([], { ...dateField, section: 'Work Experience 1' }, dates), [])
  assert.deepEqual(resolve([], { ...dateField, fieldType: 'SimpleDropdown' }, dates), [])
  for (const value of [['13', '2023'], ['00', '2023'], ['08', '23'], ['08', '15', '2023'], 'Present']) {
    assert.deepEqual(resolve([], dateField, dateProfile(value)), [])
  }
  const yearField = { ...dateField, fieldType: 'Year' }
  assert.equal(resolve([], yearField, { entries: [{ labels: ['From'], value: '2023' }] })[0].answer, '2023')
  assert.deepEqual(resolve([], yearField, { entries: [{ labels: ['From'], value: '23' }] }), [])
})

test('editing a profile answer creates a Chrome answer and refreshes the fallback', async () => {
  const states = []
  let cursor = 0
  let stored = []
  const requests = []
  const { useEditableAnswerState } = loadTs('src/inject/app/hooks/useEditableAnswerState.ts', {
    react: { useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (update) => {
        states[index] = typeof update === 'function' ? update(states[index]) : update
      }]
    } },
    '@src/shared/utils/async': { sleep: async () => {} },
    '../services/contentScriptApi': { contentScriptAPI: { async send(method, answer) {
      requests.push({ method, answer })
      stored = [{ ...answer, id: 5 }]
      return { ok: true, data: stored[0] }
    } } },
  })
  const backend = {
    answer: async () => resolve(stored, field, profile),
    answerValue: { init: structuredClone, prepForSave: (value) => value },
  }
  const render = () => { cursor = 0; return useEditableAnswerState(backend) }
  let state = render()
  await state.init()
  state = render()
  const id = state.answers[0].id
  assert.equal(typeof id, 'number')
  assert.ok(id < 0)
  state.setEditedValue(id, 'override@example.test')
  state = render()
  await state.saveAnswer(id)
  assert.equal(requests[0].method, 'addAnswer')
  assert.equal(requests[0].answer.id, undefined)
  assert.equal(requests[0].answer.answer, 'override@example.test')
  state = render()
  assert.equal(state.answers.length, 1)
  assert.equal(state.answers[0].id, 5)
  assert.equal(state.answers[0].originalAnswer.source, undefined)
  assert.equal(profile.entries[0].value, 'test@example.test')
})

test('Greenhouse boolean filling handles both false and true without toggling a correct value', async () => {
  const { CheckboxBoolean } = loadTs('src/inject/app/services/formFields/greenhouseReact/CheckboxBoolean.ts', {
    '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleBool': { AnswerValueSingleBool: () => null },
    '@src/shared/utils/fieldFillerQueue': { enqueue: async (callback) => callback() },
    '@src/shared/utils/getElements': { getElement: () => null },
    './GreenhouseReactBaseInput': { GreenhouseReactBaseInput: class {} },
    './xpaths': { xpaths: {} },
    './ElementWrappers/CheckboxWrapperContainer': { CheckboxWrapperContainer: class {} },
  })
  const checkbox = new CheckboxBoolean()
  const clicks = []
  const wrapper = {
    checked: true,
    check() { this.checked = true; clicks.push(true) },
    uncheck() { this.checked = false; clicks.push(false) },
  }
  Object.defineProperty(checkbox, 'checkboxWrapper', { value: wrapper })
  checkbox.answer = async () => [{ answer: false }]
  await checkbox.fill()
  await checkbox.fill()
  assert.equal(wrapper.checked, false)
  checkbox.answer = async () => [{ answer: true }]
  await checkbox.fill()
  await checkbox.fill()
  assert.equal(wrapper.checked, true)
  assert.deepEqual(clicks, [false, true])
})

test('Webpack uses the blank tracked template when a checkout has no local profile', () => {
  const root = path.join(__dirname, '..')
  const source = fs.readFileSync(path.join(root, 'webpack.common.js'), 'utf8')
  for (const exists of [false, true]) {
    const module = { exports: {} }
    new Function('require', 'module', '__dirname', source)(
      (name) => name === 'fs' ? { existsSync: () => exists } : require(name), module, root
    )
    assert.equal(module.exports.resolve.alias['local-profile$'],
      path.resolve(root, exists ? 'profile.local.json' : 'profile.example.json'))
  }
})
