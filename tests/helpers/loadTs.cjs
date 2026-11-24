const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
module.exports = function loadTs(filename, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const result = { exports: {} }
  const requireMock = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name]
    throw new Error(`Unexpected dependency: ${name}`)
  }
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(requireMock, result, result.exports, ...Object.values(globals))
  return result.exports
}
