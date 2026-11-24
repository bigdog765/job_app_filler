const assert = require('node:assert/strict')
const { test } = require('node:test')
const { JSDOM } = require('jsdom')
const loadTs = require('./helpers/loadTs.cjs')
const utils = loadTs('src/inject/app/services/formFields/utils/index.ts')
const matcher = loadTs('src/inject/app/services/formFields/greenhouseReact/optionMatching.ts')
const fallback = loadTs('src/contentScript/utils/storage/profileFallback.ts')
const { profileSuggestion } = loadTs('src/contentScript/utils/storage/profileSuggestions.ts', {
  '@src/shared/utils/profileSemantics': loadTs('src/shared/utils/profileSemantics.ts'),
  './profileFallback': fallback,
})

test('option equivalence handles months, states, country codes, pronouns and explicit degree alternatives', () => {
  const document = new JSDOM('').window.document
  const options = values => values.map(value => {
    const node = document.createElement('div'); node.textContent = value; return node
  })
  for (const [label, answers, values, expected] of [
    ['Start date month', ['08'], ['July', 'August'], 'August'],
    ['US State', ['Michigan'], ['MI', 'MN'], 'MI'],
    ['Country', ['United States'], ['United States +1', 'Canada +1'], 'United States +1'],
    ['Country Code', ['+1'], ['United States +1', 'Canada +1'], undefined],
    ['Pronouns', ['He / Him'], ['He/Him', 'They/Them'], 'He/Him'],
    ['Degree', ['Bachelor of Science', 'Bachelors'], ['Bachelors', 'Masters'], 'Bachelors'],
    ['Location (City)', ['Royal Oak, MI'], ['Royal Oak, Michigan, United States'], 'Royal Oak, Michigan, United States'],
    ['Location (City)', ['Portland'], ['Portland, Oregon', 'Portland, Maine'], undefined],
  ]) {
    assert.equal(matcher.matchingOption(options(values), answers, label)?.textContent, expected, label)
  }
})

test('split education dates use the correct profile record and field format', () => {
  const profile = { entries: [
    { labels: ['Start Date'], sections: ['Education 1'], fieldTypes: ['MonthYear'], value: ['08', '2019'] },
    { labels: ['Start Date'], sections: ['Education 2'], fieldTypes: ['MonthYear'], value: ['01', '2024'] },
  ] }
  assert.deepEqual(profileSuggestion({ fieldName: 'Start date month*', section: 'education 1', fieldType: 'SimpleDropdown' }, profile), ['08'])
  assert.equal(profileSuggestion({ fieldName: 'Start date year*', section: 'education 2', fieldType: 'TextInput' }, profile), '2024')
})

test('dropdown searches small remote lists, waits for delayed results and preserves the old selection on a miss', async () => {
  const window = new JSDOM('<div class="select"><label>School</label><div class="select-shell"><div id="trigger"></div></div><input role="combobox"><div class="select__single-value">Original School</div><div role="listbox"></div></div>').window
  window.HTMLElement.prototype.getClientRects = () => [{ width: 20, height: 20 }]
  const element = window.document.querySelector('.select')
  const input = element.querySelector('input')
  let elapsed = 0, searchedAt = null, searches = 0
  const { selectAnswer } = loadTs('src/inject/app/services/formFields/greenhouseReact/selectControl.ts', {
    '../utils': utils, './optionMatching': matcher,
    '@src/shared/utils/async': { sleep: async ms => {
      elapsed += ms
      if (searchedAt !== null && elapsed - searchedAt >= 1200 && input.value === 'Wayne State University' &&
          !element.querySelector('[role="option"]')) {
        const option = window.document.createElement('div')
        option.setAttribute('role', 'option'); option.textContent = 'Wayne State University'
        option.addEventListener('click', () => { element.querySelector('.select__single-value').textContent = option.textContent })
        element.querySelector('[role="listbox"]').append(option)
      }
    } },
  })
  element.querySelector('#trigger').__reactPropsTest = { onMouseUp() { input.setAttribute('aria-expanded', 'true') } }
  input.__reactPropsTest = { onChange() { if (input.value) { searches++; searchedAt = elapsed } }, onBlur() { input.setAttribute('aria-expanded', 'false') } }
  assert.equal(await selectAnswer(element, ['Missing school'], 'School'), false)
  assert.equal(element.querySelector('.select__single-value').textContent, 'Original School')
  assert.equal(await selectAnswer(element, ['Wayne State University'], 'School'), true)
  assert.equal(element.querySelector('.select__single-value').textContent, 'Wayne State University')
  assert.ok(searches >= 2)
  assert.equal(input.getAttribute('aria-expanded'), 'false')
  window.close()
})

test('required diagnostics retain multiple failures and clear resolved or optional fields', () => {
  const diagnostics = loadTs('src/contentScript/fieldDiagnostics.ts')
  const field = { fieldName: 'School', section: 'education 1', required: true, stage: 'selection' }
  diagnostics.reportFieldResult(field)
  diagnostics.reportFieldResult({ ...field, fieldName: 'Email', stage: 'matching' })
  diagnostics.reportFieldResult({ ...field, fieldName: 'Optional', required: false })
  assert.equal(diagnostics.getFieldDiagnostics().length, 2)
  diagnostics.reportFieldResult({ ...field, stage: null })
  assert.deepEqual(diagnostics.getFieldDiagnostics().map(item => item.fieldName), ['Email'])
})

test('a failed queued fill rejects its caller and allows the next field to run', async () => {
  const queue = loadTs('src/shared/utils/fieldFillerQueue.ts').default
  let filled = false
  const first = queue.enqueue(async () => { throw new Error('Disconnected field') })
  const second = queue.enqueue(async () => { filled = true })
  await assert.rejects(first, /Disconnected/)
  await second
  assert.equal(filled, true)
})

test('eight AI requests run concurrently and failed matches can be requested again', async () => {
  let handler
  const waiting = []
  const chrome = {
    runtime: { id: 'jaf', onMessage: { addListener(fn) { handler = fn } } },
    tabs: { onRemoved: { addListener() {} } },
    storage: { onChanged: { addListener() {} }, session: { remove: async () => {}, get: async () => ({}), set: async () => {} } },
  }
  loadTs('src/background/background.ts', {
    'local-profile': {}, './profileMatcher': { candidatesFor: () => [{ id: 1 }],
      selectProfileEntry: () => new Promise((resolve, reject) => waiting.push({ resolve, reject })) },
  }, { chrome })
  const send = name => new Promise(resolve => handler({ type: 'MATCH_PROFILE_OPENAI',
    path: { fieldName: name, section: '', fieldType: 'TextInput' } },
    { id: 'jaf', tab: { id: 1 }, url: 'https://job-boards.greenhouse.io' }, resolve))
  const requests = Array.from({ length: 8 }, (_, i) => send('field' + i))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(waiting.length, 8)
  waiting[0].reject(new TypeError('temporary outage'))
  waiting.slice(1).forEach(item => item.resolve(1))
  await Promise.all(requests)
  const retry = send('field0')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(waiting.length, 9)
  waiting[8].resolve(1)
  assert.deepEqual(await retry, { entryId: 1 })
})

test('AI retries a temporary HTTP failure within the same request', async () => {
  const { selectProfileEntry } = loadTs('src/background/profileMatcher.ts', {
    '@src/contentScript/utils/storage/profileFallback': fallback,
    '@src/shared/utils/profileSemantics': loadTs('src/shared/utils/profileSemantics.ts'),
  }, { process: { env: {} } })
  let calls = 0
  const answer = await selectProfileEntry({ fieldName: 'Name', section: '', fieldType: 'TextInput' }, [{ id: 2 }],
    async () => ++calls === 1 ? { ok: false, status: 429 } : { ok: true, json: async () => ({ entryId: 2 }) })
  assert.equal(answer, 2)
  assert.equal(calls, 2)
})
