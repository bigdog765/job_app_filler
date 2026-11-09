const assert = require('node:assert/strict')
const { test } = require('node:test')
const { JSDOM } = require('jsdom')
const fs = require('node:fs')
const path = require('node:path')
const loadTs = require('./helpers/loadTs.cjs')
const utils = loadTs('src/inject/app/services/formFields/utils/index.ts')
const textControl = loadTs('src/inject/app/services/formFields/greenhouseReact/textControl.ts')
const { xpaths } = loadTs('src/inject/app/services/formFields/greenhouseReact/xpaths.ts')
const phoneMarkup = fs.readFileSync(path.join(__dirname, 'fixtures/greenhouse-phone.html'), 'utf8')
const markup = '<div class="application--container"><div class="text-input-wrapper"><div class="input-wrapper"><label for="last_name">Last Name*</label><input id="last_name" type="text" autocomplete="family-name" value=""></div></div></div>'

function textBackend(document, sleep) {
  class Base {
    constructor(element) { this.element = element; this.listenForChanges() }
    triggerReactUpdate() {}
  }
  const { TextInput } = loadTs('src/inject/app/services/formFields/greenhouseReact/TextInput.ts', {
    '@src/shared/utils/getElements': { getElement: (element, xpath) => element.querySelector(xpath.includes('label') ? 'label' : 'input') },
    './GreenhouseReactBaseInput': { GreenhouseReactBaseInput: Base }, './xpaths': { xpaths: {} },
    '../utils': utils, './textControl': textControl, '@src/shared/utils/async': { sleep },
  })
  const backend = new TextInput(document.querySelector('.text-input-wrapper'))
  backend.answer = async () => [{ answer: 'Example Surname' }]
  return backend
}

test('Greenhouse discovery waits for hydration and retries even without DOM mutations', async () => {
  const document = new JSDOM(markup).window.document
  let retry, registrations = 0
  const imports = { '../utils': utils, './textControl': textControl }
  for (const name of ['AddressSearchable', 'CheckboxBoolean', 'CheckboxMulti', 'DropdownMultiSearchable', 'DropdownSearchable', 'File', 'NumberInput', 'Section', 'Textarea', 'TextInput']) {
    imports[`./${name}`] = { [name]: { autoDiscover: async () => { registrations++ } } }
  }
  const { RegisterInputs } = loadTs('src/inject/app/services/formFields/greenhouseReact/index.ts', imports, {
    document, setTimeout: fn => { retry = fn; return 1 }, clearTimeout() {},
  })
  await RegisterInputs()
  assert.equal(registrations, 0)
  assert.equal(typeof retry, 'function')
  document.querySelector('input').__reactPropsTest = { onChange() {} }
  retry()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(registrations, 10)
  // The container is looked up again when navigation replaces/loads the form.
  document.body.innerHTML = ''
  await RegisterInputs()
  document.body.innerHTML = markup
  await RegisterInputs()
  assert.equal(registrations, 10)
})

test('the non-React phone search does not block registration, but the actual phone still waits for hydration', async () => {
  const window = new JSDOM(phoneMarkup).window
  const { document } = window
  const registrations = []
  let retry
  const imports = { '../utils': utils, './textControl': textControl }
  for (const name of ['AddressSearchable', 'CheckboxBoolean', 'CheckboxMulti', 'DropdownMultiSearchable', 'DropdownSearchable', 'File', 'NumberInput', 'Section', 'Textarea', 'TextInput']) {
    imports[`./${name}`] = { [name]: { autoDiscover: async () => { registrations.push(name) } } }
  }
  const { RegisterInputs } = loadTs('src/inject/app/services/formFields/greenhouseReact/index.ts', imports, {
    document, setTimeout: fn => { retry = fn; return 1 }, clearTimeout() { retry = undefined },
  })
  try {
    document.getElementById('first_name').__reactPropsTest = { onChange() {} }
    await RegisterInputs()
    assert.equal(registrations.length, 0)
    assert.equal(typeof retry, 'function')
    document.getElementById('phone').__reactPropsTest = { onInput() {} }
    retry()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(registrations.length, 10)
    assert.equal(retry, undefined)
    assert.equal(utils.getReactProps(document.getElementById('iti-0__search-input')), undefined)
  } finally { window.close() }
})

test('Greenhouse discovers the phone and targets its labeled input instead of the nested country search', () => {
  const window = new JSDOM(phoneMarkup).window
  try {
    const { document } = window
    const found = document.evaluate(xpaths.TEXT_INPUT, document, null, 7, null)
    assert.equal(found.snapshotLength, 2)
    assert.deepEqual(Array.from({ length: found.snapshotLength }, (_,i) =>
      textControl.getTextControl(found.snapshotItem(i)).id), ['first_name', 'phone'])
  } finally { window.close() }
})

test('phone autofill reaches native widget listeners and React onInput without editing the country search', async () => {
  const window = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }).window
  const previous = { window: global.window, document: global.document, navigator: global.navigator, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = window; global.document = window.document
  Object.defineProperty(global, 'navigator', { configurable: true, value: window.navigator })
  global.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react')
  const { renderToString } = require('react-dom/server')
  const { hydrateRoot } = require('react-dom/client')
  const events = []
  let root
  function Form() {
    const [phone, setPhone] = React.useState('')
    const ref = React.useRef(null)
    React.useEffect(() => {
      const input = ref.current
      const search = window.document.createElement('input')
      search.type = 'search'; search.id = 'country-search'
      input.before(search)
      const onInput = () => { events.push('native') }
      input.addEventListener('input', onInput)
      return () => { search.remove(); input.removeEventListener('input', onInput) }
    }, [])
    return React.createElement('div', { className: 'text-input-wrapper' },
      React.createElement('label', { htmlFor: 'phone' }, 'Phone*'),
      React.createElement('input', { ref, id: 'phone', type: 'tel', value: phone,
        onInput: event => { events.push('react'); setPhone(event.currentTarget.value) } }),
      React.createElement('output', null, phone))
  }
  try {
    const container = window.document.getElementById('root')
    container.innerHTML = renderToString(React.createElement(Form))
    await React.act(async () => { root = hydrateRoot(container, React.createElement(Form)) })
    const backend = textBackend(window.document, async () => {})
    backend.answer = async () => [{ answer: '+15555550123' }]
    await React.act(async () => { await backend.autoFill() })
    assert.equal(container.querySelector('output').textContent, '+15555550123')
    assert.equal(window.document.getElementById('phone').value, '+15555550123')
    assert.equal(window.document.getElementById('country-search').value, '')
    assert.deepEqual(events, ['native', 'react'])
  } finally {
    if (root) await React.act(async () => root.unmount())
    window.close()
    global.window = previous.window; global.document = previous.document
    Object.defineProperty(global, 'navigator', { configurable: true, value: previous.navigator })
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('last name survives a late reset in a real hydrated React form, without the wand', async () => {
  const window = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }).window
  const previous = { window: global.window, document: global.document, navigator: global.navigator, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = window; global.document = window.document
  Object.defineProperty(global, 'navigator', { configurable: true, value: window.navigator })
  global.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react')
  const { renderToString } = require('react-dom/server')
  const { hydrateRoot } = require('react-dom/client')
  let reset, root
  function Form() {
    const [name, setName] = React.useState('')
    reset = () => setName('')
    return React.createElement('div', { className: 'text-input-wrapper' },
      React.createElement('label', { htmlFor: 'last_name' }, 'Last Name*'),
      React.createElement('input', { id: 'last_name', type: 'text', value: name,
        onChange: event => setName(event.target.value) }),
      React.createElement('output', null, name))
  }
  const waits = []
  try {
    const container = window.document.getElementById('root')
    container.innerHTML = renderToString(React.createElement(Form))
    const backend = textBackend(window.document, () => new Promise(resolve => waits.push(resolve)))
    let pending
    // Early filling cannot persist a DOM-only value before React is ready.
    pending = backend.autoFill()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(backend.currentValue(), '')
    await React.act(async () => { root = hydrateRoot(container, React.createElement(Form)) })
    await React.act(async () => { waits.shift()(); await new Promise(resolve => setImmediate(resolve)) })
    assert.equal(backend.currentValue(), 'Example Surname')
    assert.equal(container.querySelector('output').textContent, 'Example Surname')
    await React.act(async () => { reset() })
    assert.equal(backend.currentValue(), '')
    await React.act(async () => { waits.shift()(); await new Promise(resolve => setImmediate(resolve)) })
    assert.equal(container.querySelector('output').textContent, 'Example Surname')
    while (waits.length) await React.act(async () => { waits.shift()(); await new Promise(resolve => setImmediate(resolve)) })
    await pending
  } finally {
    if (root) await React.act(async () => root.unmount())
    window.close()
    global.window = previous.window; global.document = previous.document
    Object.defineProperty(global, 'navigator', { configurable: true, value: previous.navigator })
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  }
})

test('Greenhouse retry preserves a user edit made while the answer lookup was pending', async () => {
  const window = new JSDOM(markup, { pretendToBeVisual: true }).window
  const backend = textBackend(window.document, async () => {})
  const input = window.document.querySelector('input')
  let calls = 0, finish
  input.__reactPropsTest = { onChange() { calls++ } }
  backend.answer = () => new Promise(resolve => { finish = resolve })
  const pending = backend.autoFill()
  input.focus(); input.value = 'Typed surname'
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
  finish([{ answer: 'Example Surname' }])
  await pending
  assert.equal(input.value, 'Typed surname')
  assert.equal(calls, 0)
  window.close()
})
