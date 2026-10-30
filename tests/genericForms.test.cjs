const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')
const loadTs = require('./helpers/loadTs.cjs')
const heading = loadTs('src/inject/app/services/formFields/workday/sectionHeading.ts')
const dom = loadTs('src/inject/app/services/formFields/generic/dom.ts', { '../workday/sectionHeading': heading })
const { getSiteAdapter } = loadTs('src/shared/utils/siteAdapter.ts')
const { answersWithProfileFallback } = loadTs('src/contentScript/utils/storage/profileFallback.ts')
function documentFor(html) {
  const window = new JSDOM(html, { url: 'https://company.example/careers/apply' }).window
  // jsdom has no layout engine; CSS visibility is still checked by the adapter.
  window.HTMLElement.prototype.getClientRects = () => [{ width: 200, height: 30 }]
  return window.document
}
const field = (id, label, type = 'text') => `<label for="${id}">${label}</label><input id="${id}" type="${type}">`

test('Lever Unicode required labels match profile values for full name and contact fields', () => {
  const document = documentFor(fs.readFileSync(path.join(__dirname, 'fixtures/lever-application.html'), 'utf8'))
  const profile = { entries: [
    { labels: ['Full Name'], sections: [''], value: 'Example Applicant' },
    { labels: ['Email'], sections: [''], value: 'example@example.test' },
    { labels: ['Phone'], sections: [''], value: '5551234567' },
    { labels: ['Current Company'], value: 'Example Company' },
    { labels: ['LinkedIn URL'], value: 'https://linkedin.com/in/example' },
    { labels: ['GitHub URL'], value: 'https://github.com/example' },
    { labels: ['Portfolio URL'], value: 'https://example.test' },
  ] }
  assert.equal(dom.isApplicationForm(document.querySelector('form')), true)
  const controls = dom.discoverControls(document)
  assert.equal(controls.length, 7)
  for (const control of controls) {
    const answers = answersWithProfileFallback([], {
      fieldName: dom.fieldLabel(control), section: dom.fieldSection(control), fieldType: dom.controlType(control),
    }, profile)
    assert.equal(answers.length, 1, `Missing fallback for ${dom.fieldLabel(control)}`)
    dom.fillControl(control, answers.map((answer) => answer.answer))
    assert.equal(control.value, answers[0].answer)
  }
  assert.equal(document.querySelector('[name="name"]').value, 'Example Applicant')
  const location = document.querySelector('[name="location"]')
  assert.equal(dom.controlLabel(location), 'Current location')
  assert.equal(dom.isUsable(location), false)
  assert.equal(location.value, '')
})

test('Unicode required markers also count as identity fields during application detection', () => {
  const document = documentFor(`<form>${field('full', 'Full name✱')}${field('file', 'Resume/CV', 'file')}</form>`)
  assert.equal(dom.isApplicationForm(document.querySelector('form')), true)
})

test('routes only genuine ATS hosts to their specialized adapters', () => {
  assert.equal(getSiteAdapter('company.myworkdayjobs.com'), 'workday')
  assert.equal(getSiteAdapter('boards.eu.greenhouse.io'), 'greenhouse')
  assert.equal(getSiteAdapter('job-boards.greenhouse.io'), 'greenhouseReact')
  for (const host of ['company.example', 'notmyworkdayjobs.com', 'myworkdayjobs.com.evil.example']) {
    assert.equal(getSiteAdapter(host), 'generic')
  }
})

test('discovers standard fields in the repo sample job form, but excludes consent and uploads', () => {
  const document = documentFor(fs.readFileSync(path.join(__dirname, '../docs/mock_job_application.html'), 'utf8'))
  const controls = dom.discoverControls(document)
  assert.ok(controls.some((control) => control.id === 'firstName'))
  assert.ok(controls.some((control) => control.id === 'email'))
  assert.ok(controls.some((control) => control.id === 'jobType'))
  assert.ok(controls.some((control) => control.id === 'skills'))
  assert.ok(controls.every((control) => control.type !== 'file' && !dom.isConsent(control)))
})

test('does not autofill newsletter, login, search, or ordinary contact forms', () => {
  for (const html of [
    `<form id="newsletter">${field('name', 'Name')}${field('email', 'Email')}</form>`,
    `<form>${field('email', 'Email')}${field('pass', 'Password', 'password')}</form>`,
    `<form><input name="search" type="search"></form>`,
    `<h1>Careers</h1><form>${field('name', 'Name')}${field('email', 'Email')}<textarea aria-label="Message"></textarea></form>`,
  ]) assert.equal(dom.discoverControls(documentFor(html)).length, 0)
  const contact = documentFor(`<form>${field('name', 'Name')}${field('email', 'Email')}</form>`)
  assert.equal(dom.discoverControls(contact, true).length, 2)
})

test('reads explicit, wrapping and ARIA labels, autocomplete, and machine-readable names', () => {
  const document = documentFor(`<form>
    <label>First Name<input id="wrapped"><span data-jaf-ui>Autofill</span></label>
    <span id="last-label">Last Name</span><input id="aria" aria-labelledby="last-label">
    <input id="auto" autocomplete="section-applicant given-name">
    <input id="machine" name="first_name"><textarea id="text" aria-label="Skills"></textarea>
  </form>`)
  assert.equal(dom.fieldLabel(document.getElementById('wrapped')), 'First Name')
  assert.equal(dom.fieldLabel(document.getElementById('aria')), 'Last Name')
  assert.equal(dom.fieldLabel(document.getElementById('auto')), 'First Name')
  assert.equal(dom.fieldLabel(document.getElementById('machine')), 'first name')
  assert.equal(dom.fieldLabel(document.getElementById('text')), 'Skills')
})

test('skips hidden, read-only, disabled, password, file, consent and extension controls even when enabled', () => {
  const document = documentFor(`<form>
    ${field('normal', 'First Name')}
    <input aria-label="Hidden" type="hidden"><input aria-label="Read only" readonly>
    <fieldset disabled><input aria-label="Disabled"></fieldset>
    <div style="display:none"><input aria-label="Invisible"></div>
    <input aria-label="I agree to the terms" type="checkbox"><input type="file" aria-label="Resume">
    <input role="combobox" aria-label="Custom dropdown">
    <div data-jaf-ui><input aria-label="Value"></div>
  </form>`)
  assert.deepEqual(dom.discoverControls(document, true).map((control) => control.id), ['normal'])
})

test('keeps numbered work history and education separate', () => {
  const document = documentFor(`<form><fieldset><legend>Work Experience 1</legend>${field('one', 'Company')}
    <fieldset><legend>Currently employed?</legend><label>Yes<input id="employed" type="radio" name="current"></label></fieldset></fieldset>
    <fieldset><legend>Work Experience 2</legend>${field('two', 'Company')}</fieldset>
    <fieldset><legend>Education 1</legend>${field('school', 'School')}</fieldset></form>`)
  assert.equal(dom.fieldSection(document.getElementById('one')), 'Work Experience 1')
  assert.equal(dom.fieldSection(document.getElementById('employed')), 'Work Experience 1')
  assert.equal(dom.fieldSection(document.getElementById('two')), 'Work Experience 2')
  assert.equal(dom.fieldSection(document.getElementById('school')), 'Education 1')
})

test('uses native setters and bubbles input/change for text, email and textarea fields', () => {
  const document = documentFor(`<form>${field('name', 'Name')}<textarea id="summary"></textarea></form>`)
  const control = document.getElementById('name')
  let intercepted = 0
  const native = Object.getOwnPropertyDescriptor(document.defaultView.HTMLInputElement.prototype, 'value')
  Object.defineProperty(control, 'value', {
    get() { return native.get.call(this) }, set(value) { intercepted++; native.set.call(this, value) },
  })
  const events = []
  document.querySelector('form').addEventListener('input', () => events.push('input'))
  document.querySelector('form').addEventListener('change', () => events.push('change'))
  dom.fillControl(control, ['Example Applicant'])
  assert.equal(control.value, 'Example Applicant')
  assert.equal(intercepted, 0)
  assert.deepEqual(events, ['input', 'change'])
  dom.fillControl(document.getElementById('summary'), ['Multiline\nsummary'])
  assert.equal(document.getElementById('summary').value, 'Multiline\nsummary')
})

test('updates a real React controlled input state, not just its DOM value', () => {
  const document = documentFor('<div id="root"></div>')
  const previousWindow = global.window
  const previousDocument = global.document
  global.window = document.defaultView
  global.document = document
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  const { flushSync } = require('react-dom')
  const root = createRoot(document.getElementById('root'))
  let stateValue = ''
  function Form() {
    const [value, setValue] = React.useState('')
    stateValue = value
    return React.createElement('input', { 'aria-label': 'Name', value,
      onChange: (event) => setValue(event.target.value) })
  }
  try {
    flushSync(() => root.render(React.createElement(Form)))
    flushSync(() => dom.fillControl(document.querySelector('input'), ['React state updated']))
    assert.equal(stateValue, 'React state updated')
  } finally {
    flushSync(() => root.unmount())
    global.window = previousWindow
    global.document = previousDocument
    document.defaultView.close()
  }
})

test('selects alternatives by label or value and supports multiselect without selecting placeholders', () => {
  const document = documentFor(`<select id="single"><option value="">Choose</option><option value="MI">Michigan</option><option disabled value="NY">New York</option></select>
    <select id="multi" multiple><option value="a">Alpha</option><option value="b">Beta</option></select>`)
  const single = document.getElementById('single')
  dom.fillControl(single, [['Unknown', 'michigan']])
  assert.equal(single.value, 'MI')
  dom.fillControl(single, [['Choose', 'New York']])
  assert.equal(single.value, 'MI')
  dom.fillControl(document.getElementById('multi'), [['Alpha', 'b']])
  assert.deepEqual(dom.currentValue(document.getElementById('multi')), ['Alpha', 'Beta'])
})

test('groups radio questions and fills only a matching option; boolean false can uncheck', () => {
  const document = documentFor(`<form><fieldset><legend>Willing to relocate?</legend>
    <label>Yes<input id="yes" type="radio" name="relocate" value="y"></label>
    <label>No<input id="no" type="radio" name="relocate" value="n"></label></fieldset>
    <label>I currently work here<input id="current" type="checkbox" checked></label></form>`)
  const yes = document.getElementById('yes')
  assert.equal(dom.fieldLabel(yes), 'Willing to relocate?')
  assert.equal(dom.discoverControls(document, true).filter((control) => control.type === 'radio').length, 1)
  dom.fillControl(yes, ['No'])
  assert.equal(document.getElementById('no').checked, true)
  dom.fillControl(document.getElementById('current'), [false])
  assert.equal(document.getElementById('current').checked, false)
})

test('handles native month and date inputs without clearing fields on invalid answers', () => {
  const document = documentFor('<input id="month" type="month"><input id="date" type="date" value="2020-01-01">')
  dom.fillControl(document.getElementById('month'), [['08', '2023']])
  assert.equal(document.getElementById('month').value, '2023-08')
  assert.deepEqual(dom.currentValue(document.getElementById('month')), ['08', '2023'])
  dom.fillControl(document.getElementById('date'), ['08/2023'])
  assert.equal(document.getElementById('date').value, '2020-01-01')
  dom.fillControl(document.getElementById('date'), ['2023-08-10'])
  assert.equal(document.getElementById('date').value, '2023-08-10')
})

test('generic automatic filling preserves populated values and edits made during lookup', async () => {
  class Base {
    constructor(element) { this.element = element; this.listenForChanges() }
    triggerReactUpdate() {}
  }
  const component = { default: () => null }
  const { GenericInput } = loadTs('src/inject/app/services/formFields/generic/GenericInput.tsx', {
    react: {}, 'react-dom/client': {}, '../baseFormInput': { BaseFormInput: Base },
    '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueBackupStrings': component,
    '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleBool': component,
    '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleDate': component,
    '../../../hooks/answerValueInit': { answerValueInitList: (values) => values.map((v) => [v, false]) },
    './dom': dom,
  })
  const document = documentFor(field('name', 'Name'))
  const control = document.getElementById('name')
  const backend = new GenericInput(control)
  backend.answer = async () => [{ answer: 'From profile' }]
  control.value = 'Already entered'
  await backend.autoFill()
  assert.equal(control.value, 'Already entered')
  control.value = ''
  let finish
  backend.answer = () => new Promise((resolve) => { finish = resolve })
  const pending = backend.autoFill()
  control.value = 'User typing'
  control.dispatchEvent(new document.defaultView.Event('input'))
  finish([{ answer: 'From profile' }])
  await pending
  assert.equal(control.value, 'User typing')
  backend.answer = async () => [{ answer: 'Manual replacement' }]
  await backend.fill()
  assert.equal(control.value, 'Manual replacement')
})

test('isolated generic transport never dispatches the page-event client', async () => {
  let bridgeCalls = 0
  const transport = loadTs('src/inject/app/services/contentScriptApi.ts', {
    '@src/shared/utils/crossContextCommunication/client': { Client: class { async send() { bridgeCalls++; return { ok: true } } } },
  }, { process: { env: {} } })
  transport.setLocalTransport(async () => [{ answer: 'Private local answer' }])
  assert.equal((await transport.contentScriptAPI.send('getAnswer', {})).data[0].answer, 'Private local answer')
  assert.equal(bridgeCalls, 0)
})

test('observes dynamically inserted fields, avoids duplicate widgets, and cleans up removed controls', async () => {
  const document = documentFor(`<form id="applicationForm">${field('first', 'First Name')}${field('email', 'Email')}</form>`)
  const constructed = []
  const disposed = []
  class MockInput {
    constructor(control) { this.control = control; constructed.push(control.id) }
    dispose() { disposed.push(this.control.id) }
  }
  const { startGenericForms } = loadTs('src/inject/app/services/formFields/generic/index.ts', {
    './GenericInput': { GenericInput: MockInput }, './dom': dom,
  }, { MutationObserver: document.defaultView.MutationObserver })
  const forms = startGenericForms(document, async () => {})
  try {
    assert.equal(await forms.enable(), 2)
    assert.equal(await forms.enable(), 2)
    assert.deepEqual(constructed, ['first', 'email'])
    document.querySelector('form').insertAdjacentHTML('beforeend', field('phone', 'Phone'))
    await new Promise((resolve) => setTimeout(resolve, 180))
    assert.deepEqual(constructed, ['first', 'email', 'phone'])
    document.getElementById('phone').remove()
    await new Promise((resolve) => setTimeout(resolve, 180))
    assert.deepEqual(disposed, ['phone'])
  } finally { forms.stop(); document.defaultView.close() }
})

test('generic content-script bootstrap never exposes the storage bridge or injects page scripts', () => {
  const document = documentFor('<form></form>')
  let bridges = 0
  let transport = null
  let prepared = 0
  let started = 0
  const answerRequest = async () => []
  loadTs('src/contentScript/contentScript.ts', {
    './publicPath': {},
    '@src/shared/utils/crossContextCommunication/server': { Server: class { constructor() { bridges++ } } },
    '@src/shared/utils/siteAdapter': { getSiteAdapter },
    './app/App': { loadApp() {}, EVENT_LISTENER_ID: 'test' },
    './utils/storage/answerService': { answerRequest, prepareAnswers: async () => { prepared++ } },
    '@src/inject/app/services/formFields/generic': { startGenericForms() { started++; return { enable: async () => 0 } } },
    '@src/inject/app/services/contentScriptApi': { setLocalTransport(value) { transport = value } },
  }, { window: document.defaultView, document, chrome: { runtime: { onMessage: { addListener() {} } } } })
  assert.equal(started, 1)
  assert.equal(bridges, 0)
  assert.equal(prepared, 0)
  assert.equal(transport, answerRequest)
  assert.equal(document.querySelector('script'), null)
})
