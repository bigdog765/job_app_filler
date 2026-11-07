const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { JSDOM } = require('jsdom')

function loadTs(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`)
    return imports[name]
  })
  return exports
}

const sectionHeading = loadTs('src/inject/app/services/formFields/workday/sectionHeading.ts')
const { answersWithProfileFallback } = loadTs('src/contentScript/utils/storage/profileFallback.ts')
function getElement(element, xpath) {
  return element.ownerDocument.evaluate(xpath, element, null, 9, null).singleNodeValue
}
const { WorkdayBaseInput } = loadTs('src/inject/app/services/formFields/workday/WorkdayBaseInput.ts', {
  '../../../FieldWidget/fieldIndicatorRoot': {},
  '@src/shared/utils/getElements': { getElement },
  '../baseFormInput': { BaseFormInput: class {} },
  './sectionHeading': sectionHeading,
})
function backendFor(document, id) {
  const backend = new WorkdayBaseInput()
  backend.element = document.getElementById(id)
  backend.uuid = id
  return backend
}
const field = (id) => `<div id="${id}" data-automation-id="formField-jobTitle" job-app-filler="${id}"><label>Job Title*</label><input type="text"></div>`

test('detects h3 work-history headings when the legacy h4 XPath returns no section', () => {
  const document = new JSDOM(`<form><h2>Work Experience</h2>
    <div><h3>Work Experience 1</h3><div>${field('first')}</div></div>
    <div><h3>Work Experience 2</h3><div>${field('second')}</div></div>
  </form>`).window.document
  const first = backendFor(document, 'first')
  assert.equal(getElement(first.element, first.sectionLabelXpath), null)
  assert.equal(first.section, 'Work Experience 1')
  assert.equal(backendFor(document, 'second').section, 'Work Experience 2')
  const profile = { entries: [
    { labels: ['Job Title'], sections: ['Work Experience 1'], value: 'Current role' },
    { labels: ['Job Title'], sections: ['Work Experience 2'], value: 'Previous role' },
  ] }
  for (const [id, expected] of [['first', 'Current role'], ['second', 'Previous role']]) {
    const section = backendFor(document, id).section
    assert.equal(answersWithProfileFallback([], {
      section, fieldType: 'TextInput', fieldName: 'Job Title*',
    }, profile)[0].answer, expected)
  }
})

test('handles ARIA headings, nested wrappers, whitespace, and numbered education', () => {
  const document = new JSDOM(`<form>
    <section><div role="heading" aria-level="3">Work Experience\n  1</div><div><div>${field('job')}</div></div></section>
    <section><h5>Education 1</h5><div>${field('school')}</div></section>
  </form>`).window.document
  assert.equal(backendFor(document, 'job').section, 'Work Experience 1')
  assert.equal(backendFor(document, 'school').section, 'Education 1')
})

test('uses the most recent heading when repeated sections share a wrapper', () => {
  const document = new JSDOM(`<form><div>
    <h3>Work Experience 1</h3>${field('one')}
    <h3>Work Experience 2</h3>${field('two')}
    <h3>Education 1</h3>${field('education')}
  </div></form>`).window.document
  assert.equal(backendFor(document, 'two').section, 'Work Experience 2')
  assert.equal(backendFor(document, 'education').section, 'Education 1')
})

test('does not carry a role past a new unrelated heading or use a future heading', () => {
  const document = new JSDOM(`<form>
    <div>${field('before')}<h3>Work Experience 1</h3>${field('job')}</div>
    <div><h3>Application Questions</h3>${field('question')}</div>
  </form>`).window.document
  assert.equal(backendFor(document, 'before').section, '')
  assert.equal(backendFor(document, 'question').section, '')
})

test('ignores extension UI and hidden headings while preserving legacy Legal Name detection', () => {
  const document = new JSDOM(`<form>
    <div><h3>Work Experience 1</h3><h3 hidden>Work Experience 9</h3>
      <div job-app-filler="other"><h3>Text Input</h3></div>${field('job')}</div>
    <div role="group"><h4 id="legal-name">Legal Name</h4>${field('name')}</div>
  </form>`).window.document
  assert.equal(backendFor(document, 'job').section, 'Work Experience 1')
  assert.equal(backendFor(document, 'name').section, 'Legal Name')
})
