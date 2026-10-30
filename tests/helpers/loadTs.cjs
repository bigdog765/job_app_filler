const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

module.exports = function loadTs(file, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`)
    return imports[name]
  }, ...Object.values(globals))
  return exports
}
