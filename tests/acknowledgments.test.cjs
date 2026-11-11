const assert = require('node:assert/strict')
const { test } = require('node:test')
const { JSDOM } = require('jsdom')
const loadTs = require('./helpers/loadTs.cjs')
const matcher = loadTs('src/shared/utils/acknowledgment.ts')
const dom = loadTs('src/inject/app/services/formFields/generic/dom.ts', {
  '../workday/sectionHeading': loadTs('src/inject/app/services/formFields/workday/sectionHeading.ts'),
})
function setup(markup, specialized = false) {
  const window = new JSDOM(markup).window
  window.HTMLElement.prototype.getClientRects = () => [{ width: 20, height: 20 }]
  let scan
  const { startAcknowledgments } = loadTs('src/contentScript/acknowledgments.ts', {
    '@src/shared/utils/acknowledgment': matcher,
    '@src/inject/app/services/formFields/generic/dom': dom,
  }, { MutationObserver: window.MutationObserver, setTimeout: fn => { scan = fn; return 1 }, clearTimeout() {} })
  const controller = startAcknowledgments(window.document, specialized)
  return { window, document: window.document, controller, scan: () => scan() }
}

test('matches acknowledgments and reading confirmations without selecting unrelated or negative choices', () => {
  for (const label of ['I acknowledge the privacy notice', 'Acknowledgement', 'I have read and understand the application instructions']) {
    assert.equal(matcher.isAcknowledgment(label), true, label)
  }
  for (const label of ['I do not acknowledge this', 'Subscribe to our newsletter', 'I acknowledge signing up for marketing emails',
    'I am authorized to work', 'I certify my answers are accurate', 'I agree to receive job alerts']) {
    assert.equal(matcher.isAcknowledgment(label), false, label)
  }
})

test('checks every acknowledgment in an application, keeps manual unchecks, and handles dynamic/custom fields', async () => {
  const ctx = setup(`<form aria-label="Job application"><label>Name<input></label>
    <label><input type="checkbox" id="a">I acknowledge receipt of the privacy notice</label>
    <label for="b">I have read and understand the instructions</label><input id="b" type="checkbox">
    <label><input type="checkbox" id="marketing">Subscribe to newsletter</label>
    <label><input type="checkbox" disabled id="disabled">I acknowledge receipt</label>
    <div hidden><label><input type="checkbox" id="hidden">Acknowledgment</label></div>
    <label><input type="checkbox" checked id="checked">Acknowledgment</label>
    <button type="submit">Submit</button></form>`)
  const { document, window } = ctx
  let submissions = 0, changes = 0
  document.querySelector('form').addEventListener('submit', e => { e.preventDefault(); submissions++ })
  document.getElementById('a').addEventListener('change', () => changes++)
  try {
    ctx.scan()
    for (const id of ['a', 'b', 'checked']) assert.equal(document.getElementById(id).checked, true)
    for (const id of ['marketing', 'disabled', 'hidden']) assert.equal(document.getElementById(id).checked, false)
    document.getElementById('a').click()
    ctx.scan()
    assert.equal(document.getElementById('a').checked, false)
    assert.equal(changes, 2)
    const custom = document.createElement('div')
    custom.setAttribute('role', 'checkbox'); custom.setAttribute('aria-checked', 'false')
    custom.setAttribute('aria-label', 'I acknowledge this notice')
    custom.addEventListener('click', () => custom.setAttribute('aria-checked', 'true'))
    document.querySelector('form').append(custom)
    await new Promise(resolve => setImmediate(resolve))
    ctx.scan()
    assert.equal(custom.getAttribute('aria-checked'), 'true')
    assert.equal(submissions, 0)
  } finally { ctx.controller.stop(); window.close() }
})

test('does not check acknowledgments on unrelated websites; retries are bounded when a widget refuses', () => {
  const ctx = setup('<form><label><input type="checkbox" id="a">I acknowledge receipt</label></form>')
  try {
    ctx.scan()
    assert.equal(ctx.document.getElementById('a').checked, false)
    ctx.controller.enable()
    assert.equal(ctx.document.getElementById('a').checked, true)
  } finally { ctx.controller.stop(); ctx.window.close() }
  const specialized = setup('<div role="checkbox" aria-label="Acknowledgment" aria-checked="false"></div>', true)
  let attempts = 0
  specialized.document.querySelector('[role]').addEventListener('click', () => attempts++)
  try {
    for (let i = 0; i < 10; i++) specialized.scan()
    assert.equal(attempts, 3)
  } finally { specialized.controller.stop(); specialized.window.close() }
})
