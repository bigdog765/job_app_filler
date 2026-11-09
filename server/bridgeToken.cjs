const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')

module.exports = function bridgeToken() {
  const filename = path.join(__dirname, '..', '.openai-bridge-token')
  try { fs.writeFileSync(filename, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const token = fs.readFileSync(filename, 'utf8').trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local bridge token file.')
  return token
}
