const fs = require('node:fs')
const path = require('node:path')

module.exports = function () {
  const filename = path.join(this.rootContext, 'profile.local.json')
  let result
  if (!fs.existsSync(filename)) {
    this.addMissingDependency(filename)
    result = { data: null, error: 'profile.local.json is missing. Copy profile.example.json and enter your answers.' }
  } else {
    this.addDependency(filename)
    try {
      result = { data: JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, '')), error: null }
    } catch {
      // JSON parser messages can contain personal values; never forward them.
      result = { data: null, error: 'profile.local.json could not be read as valid JSON.' }
    }
  }
  return 'module.exports = ' + JSON.stringify(result)
}
