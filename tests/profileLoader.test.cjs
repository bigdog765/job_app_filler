const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const loader = require('../build/profile-loader.cjs')

test('loader handles missing, malformed, edited and deleted profiles and registers watch dependencies', () => {
  const rootContext = fs.mkdtempSync(path.join(os.tmpdir(), 'jaf-profile-'))
  const filename = path.join(rootContext, 'profile.local.json')
  const deps = [], missing = []
  const context = { rootContext, addDependency: p => deps.push(p), addMissingDependency: p => missing.push(p) }
  const load = () => { const m = {}; new Function('module', loader.call(context))(m); return m.exports }
  try {
    assert.match(load().error, /missing/)
    assert.deepEqual(missing, [filename])
    fs.writeFileSync(filename, '{PRIVATE invalid')
    assert.equal(load().data, null)
    assert.ok(!load().error.includes('PRIVATE'))
    fs.writeFileSync(filename, '\uFEFF{"entries":[]}')
    assert.deepEqual(load(), { data: { entries: [] }, error: null })
    assert.ok(deps.includes(filename))
    fs.unlinkSync(filename)
    assert.match(load().error, /missing/)
  } finally {
    if (fs.existsSync(filename)) fs.unlinkSync(filename)
    fs.rmdirSync(rootContext)
  }
})
