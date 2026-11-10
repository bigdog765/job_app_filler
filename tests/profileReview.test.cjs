const assert = require('node:assert/strict')
const { test } = require('node:test')
const { JSDOM } = require('jsdom')
const loadTs = require('./helpers/loadTs.cjs')
const semantics = loadTs('src/shared/utils/profileSemantics.ts')
const fallback = loadTs('src/contentScript/utils/storage/profileFallback.ts')
const { profileSuggestion } = loadTs('src/contentScript/utils/storage/profileSuggestions.ts', {
  '@src/shared/utils/profileSemantics': semantics, './profileFallback': fallback,
})
const dom = loadTs('src/inject/app/services/formFields/generic/dom.ts', {
  '../workday/sectionHeading': loadTs('src/inject/app/services/formFields/workday/sectionHeading.ts'),
})
const { createProfileReview, describeProfileFields, matchesProfileAnswer } = loadTs('src/inject/app/services/formFields/generic/profileReview.ts', {
  '@src/shared/utils/fieldRequirement': loadTs('src/shared/utils/fieldRequirement.ts'),
  '@src/shared/utils/profileSemantics': semantics, './dom': dom,
})
const { createProfileAutofill } = loadTs('src/inject/app/services/formFields/generic/profileAutofill.ts', {
  './profileReview': { describeProfileFields, matchesProfileAnswer }, './dom': dom,
})
const profile = { entries: [
  { labels: ['First Name'], value: 'Example', sections: [''] },
  { labels: ['Company'], value: 'New Employer', sections: ['Work Experience 1'] },
  { labels: ['Job Title'], value: 'Senior Engineer', sections: ['Work Experience 1'] },
  { labels: ['Company'], value: 'Previous Employer', sections: ['Work Experience 2'] },
  { labels: ['Job Title'], value: 'Engineer', sections: ['Work Experience 2'] },
] }
const input = (id, label, value = '') => `<label for="${id}">${label}</label><input id="${id}" value="${value}">`
function documentFor(html) {
  const window = new JSDOM(html).window
  window.HTMLElement.prototype.getClientRects = () => [{ width: 200, height: 30 }]
  return window.document
}
const history = `<form><h2>Employment history</h2>
  <div class="record">${input('employer1', 'Name of employer', 'Old Employer')}${input('role1', 'Role title', 'Old Title')}</div>
  <div class="record">${input('employer2', 'Name of employer')}${input('role2', 'Role title')}</div>
  <h2>References</h2>${input('reference', 'Name of employer', 'Reference Employer')}</form>`

test('infers repeated unnumbered employment blocks and bounds them at the next section', () => {
  const document = documentFor(history)
  const paths = describeProfileFields(dom.discoverControls(document, true))
  assert.deepEqual(paths.map(p => p.section), ['Work Experience 1', 'Work Experience 1', 'Work Experience 2', 'Work Experience 2', 'References'])
  assert.deepEqual(paths.map(p => profileSuggestion(p, profile)), ['New Employer', 'Senior Engineer', 'Previous Employer', 'Engineer', undefined])
})

test('preview does not mutate populated history; only selected updates apply and no form is submitted', async () => {
  const document = documentFor(history)
  let submits = 0
  document.querySelector('form').addEventListener('submit', () => submits++)
  const review = createProfileReview(document, async path => profileSuggestion(path, profile))
  const { rows } = await review.scan()
  assert.equal(document.getElementById('employer1').value, 'Old Employer')
  assert.equal(rows[0].suggested, 'New Employer')
  assert.match(rows[0].reason, /page order|record order/)
  assert.equal(rows[4].status, 'unmatched')
  assert.deepEqual(review.apply([rows[0].id, rows[1].id]), { applied: 2, skipped: 0 })
  assert.equal(document.getElementById('employer1').value, 'New Employer')
  assert.equal(document.getElementById('role1').value, 'Senior Engineer')
  assert.equal(document.getElementById('employer2').value, '')
  assert.equal(submits, 0)
})

test('stale previews cannot overwrite user edits, removed fields, or a reordered record', async () => {
  for (const mutate of [
    d => { d.getElementById('employer1').value = 'User edit' },
    d => d.getElementById('employer1').remove(),
    d => d.querySelector('form').insertBefore(d.querySelectorAll('.record')[1], d.querySelector('.record')),
  ]) {
    const document = documentFor(history)
    const review = createProfileReview(document, async path => profileSuggestion(path, profile))
    const { rows } = await review.scan()
    mutate(document)
    assert.deepEqual(review.apply([rows[0].id]), { applied: 0, skipped: 1 })
  }
})

test('refreshing review invalidates old IDs and changes during lookup are not actionable', async () => {
  const document = documentFor(`<form>${input('first', 'Forename', 'Old')}</form>`)
  const review = createProfileReview(document, async path => profileSuggestion(path, profile))
  const first = await review.scan()
  await review.scan()
  assert.deepEqual(review.apply([first.rows[0].id]), { applied: 0, skipped: 1 })
  const racing = createProfileReview(document, async () => {
    document.getElementById('first').value = 'Typing'
    return 'Example'
  })
  assert.equal((await racing.scan()).rows[0].status, 'changed')
})

test('editing an employer invalidates other suggested fields in that employment record', async () => {
  const document = documentFor(history)
  const review = createProfileReview(document, async path => profileSuggestion(path, profile))
  const { rows } = await review.scan()
  document.getElementById('employer1').value = 'A different employer'
  assert.deepEqual(review.apply([rows[1].id]), { applied: 0, skipped: 1 })
  assert.equal(document.getElementById('role1').value, 'Old Title')
})

test('profile review does not consult stale Chrome answers', async () => {
  let reads = 0
  const { answerRequest } = loadTs('src/contentScript/utils/storage/answerService.ts', {
    './aiProfile': { aiProfileAnswer: async () => [] },
    './Answers1010': { answers1010: { search() { reads++; return [{ answer: 'Stale' }] } } },
    './DataStore': {}, './DataStoreTypes': {}, './migrateEducationSectionNames': {},
    'local-profile': { default: profile, __esModule: true },
    './profileFallback': fallback, './profileSuggestions': { profileSuggestion },
  })
  assert.equal(await answerRequest('getProfileSuggestion', {
    fieldName: 'Role title', section: 'Employment history 1', fieldType: 'TextInput',
  }), 'Senior Engineer')
  assert.equal(reads, 0)
})

test('ambiguous repeated layout and conflicting profile answers remain unmatched', () => {
  const document = documentFor(`<form><h2>Employment history</h2>
    ${input('company1', 'Company')}${input('company2', 'Company')}${input('title', 'Role title')}</form>`)
  const paths = describeProfileFields(dom.discoverControls(document, true))
  assert.ok(paths.every(path => profileSuggestion(path, profile) === undefined))
  assert.equal(profileSuggestion({ section: '', fieldType: 'TextInput', fieldName: 'Given name' }, {
    entries: [{ labels: ['First Name'], value: 'One' }, { labels: ['Given Name'], value: 'Two' }],
  }), undefined)
})

test('registration review skips password, file, consent and custom controls but can review name', async () => {
  const document = documentFor(`<form>${input('first', 'Forename')}
    <input type="password" aria-label="Password"><input type="file" aria-label="Resume">
    <input type="checkbox" aria-label="I agree to terms"><input role="combobox" aria-label="Location">
    <input hidden aria-label="Email"></form>`)
  assert.equal(dom.discoverControls(document).length, 0)
  const review = createProfileReview(document, async path => profileSuggestion(path, profile))
  const { rows } = await review.scan()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].suggested, 'Example')
})

test('unsupported option values fail without replacing the existing selection', async () => {
  const document = documentFor('<form><select aria-label="Country"><option value="old">Existing</option></select></form>')
  const review = createProfileReview(document, async () => ['Unavailable'])
  const { rows } = await review.scan()
  assert.deepEqual(review.apply([rows[0].id]), { applied: 0, skipped: 1 })
  assert.equal(document.querySelector('select').value, 'old')
})

test('an unnumbered Work Experience Job Title matches record 1 even without a usable employer', async () => {
  for (const employer of ['', '<input role="combobox" aria-label="Employer">']) {
    const document = documentFor(`<form><h2>Work Experience</h2>${employer}
      ${input('title', 'Job Title *', 'Older role')}</form>`)
    const review = createProfileReview(document, async path => profileSuggestion(path, profile))
    const { rows } = await review.scan()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].section, 'Work Experience 1')
    assert.equal(rows[0].suggested, 'Senior Engineer')
    assert.equal(rows[0].status, 'update')
    assert.match(rows[0].reason, /job title fields in page order/)
    assert.equal(document.getElementById('title').value, 'Older role')
    assert.deepEqual(review.apply([rows[0].id]), { applied: 1, skipped: 0 })
    assert.equal(document.getElementById('title').value, 'Senior Engineer')
  }
})

test('job-title anchors keep multiple roles separate when employer controls are unavailable', () => {
  const document = documentFor(`<form><h2>Professional experience</h2>
    <div>${input('title1', 'What was your job title?')}${input('duties1', 'Describe your responsibilities')}</div>
    <div>${input('title2', 'Please enter your position title')}${input('duties2', 'Describe your duties')}</div>
    <h2>References</h2>${input('referenceTitle', 'Job title')}</form>`)
  const paths = describeProfileFields(dom.discoverControls(document, true))
  assert.deepEqual(paths.map(p => p.section), ['Work Experience 1', 'Work Experience 1', 'Work Experience 2', 'Work Experience 2', 'References'])
  assert.equal(profileSuggestion(paths[0], profile), 'Senior Engineer')
  assert.equal(profileSuggestion(paths[2], profile), 'Engineer')
  assert.equal(profileSuggestion(paths[4], profile), undefined)
})

test('one visible employer cannot collapse two visible job records into record 1', () => {
  const document = documentFor(`<form><h2>Work Experience</h2>
    <div>${input('company1', 'Company')}${input('title1', 'Job Title')}</div>
    <div><input role="combobox" aria-label="Employer">${input('title2', 'Job Title')}</div></form>`)
  assert.deepEqual(describeProfileFields(dom.discoverControls(document, true)).map(p => p.section),
    ['Work Experience 1', 'Work Experience 1', 'Work Experience 2'])
})

test('natural question phrasing resolves known meanings without conflating desired or supervisor roles', () => {
  const path = { section: 'Work Experience 1', fieldType: 'TextInput' }
  for (const fieldName of ['What is your job title?', 'Please provide your job title / position', 'Title of your position']) {
    assert.equal(profileSuggestion({ ...path, fieldName }, profile), 'Senior Engineer')
  }
  for (const fieldName of ['Desired job title', 'What is your supervisor job title?', 'Job title you are applying for']) {
    assert.equal(profileSuggestion({ ...path, fieldName }, profile), undefined)
  }
  assert.equal(profileSuggestion({ ...path, fieldName: 'Please enter the name of the company' }, profile), 'New Employer')
})

test('inference automatically replaces stale history and fills dynamically added fields without submitting', async () => {
  const document = documentFor('<form><h2>Work Experience</h2>' + input('title', 'Job Title *', 'Older role') + '</form>')
  let submits = 0
  document.querySelector('form').addEventListener('submit', () => submits++)
  const automatic = createProfileAutofill(document, async path => profileSuggestion(path, profile))
  try {
    assert.equal(dom.discoverControls(document).length, 1)
    await automatic.fill(dom.discoverControls(document))
    assert.equal(document.getElementById('title').value, 'Senior Engineer')
    document.querySelector('form').insertAdjacentHTML('beforeend', input('company', 'Company'))
    await automatic.fill(dom.discoverControls(document))
    assert.equal(document.getElementById('company').value, 'New Employer')
    assert.equal(submits, 0)
  } finally { automatic.stop() }
})

test('automatic inference preserves user edits before lookup, during lookup, and on later scans', async () => {
  const document = documentFor(history)
  let finish
  const automatic = createProfileAutofill(document, path => new Promise(resolve => {
    if (path.fieldName === 'Role title' && path.section === 'Work Experience 1') finish = () => resolve('Senior Engineer')
    else resolve(profileSuggestion(path, profile))
  }))
  const company = document.getElementById('employer2')
  company.value = 'User employer'
  company.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  const pending = automatic.fill(dom.discoverControls(document, true))
  const title = document.getElementById('role1')
  title.value = 'User role'
  title.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }))
  finish(); await pending
  assert.equal(title.value, 'User role')
  assert.equal(company.value, 'User employer')
  assert.equal(document.getElementById('employer1').value, 'Old Employer')
  await automatic.fill(dom.discoverControls(document, true))
  assert.equal(title.value, 'User role')
  automatic.stop()
})

test('automatic inference ignores unmatched fields and does not fight later site changes', async () => {
  const document = documentFor('<form><h2>Work Experience</h2>' + input('title', 'Job Title', 'Old') + input('unknown', 'Unrecognized question', 'Keep') + '</form>')
  let titleLookups = 0
  const automatic = createProfileAutofill(document, async path => {
    if (path.fieldName === 'Job Title') titleLookups++
    return profileSuggestion(path, profile)
  })
  await automatic.fill(dom.discoverControls(document))
  document.getElementById('title').value = 'Later site change'
  await automatic.fill(dom.discoverControls(document))
  assert.equal(document.getElementById('title').value, 'Later site change')
  assert.equal(document.getElementById('unknown').value, 'Keep')
  assert.equal(titleLookups, 1)
  automatic.stop()
})

test('stopping inference cancels a pending fill', async () => {
  const document = documentFor('<form><h2>Work Experience</h2>' + input('title', 'Job Title', 'Old') + '</form>')
  let finish
  const automatic = createProfileAutofill(document, () => new Promise(resolve => { finish = resolve }))
  const pending = automatic.fill(dom.discoverControls(document))
  automatic.stop(); finish('New'); await pending
  assert.equal(document.getElementById('title').value, 'Old')
})

test('an inferred dropdown retries when its matching option loads instead of requiring the wand', async () => {
  const document = documentFor('<form><select aria-label="Country"><option value="">Loading</option></select></form>')
  const control = document.querySelector('select')
  const automatic = createProfileAutofill(document, async () => ['Example country'])
  await automatic.fill(dom.discoverControls(document, true))
  assert.equal(automatic.protects(control), false)
  control.insertAdjacentHTML('beforeend', '<option value="example">Example country</option>')
  await automatic.fill(dom.discoverControls(document, true))
  assert.equal(control.value, 'example')
  assert.equal(automatic.protects(control), true)
  automatic.stop()
})
