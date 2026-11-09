const http = require('node:http')
const path = require('node:path')
const { selectProfileEntry } = require('./openaiMatcher.cjs')

function validateInput(body) {
  const { field, candidates } = body || {}
  const text = value => typeof value === 'string' && value.length <= 2000
  if (!field || !text(field.fieldName) || !field.fieldName.trim() || !text(field.section) || !text(field.fieldType) ||
      !Array.isArray(candidates) || candidates.length > 1000 || candidates.some(c =>
        !c || !Number.isInteger(c.id) || c.id < 0 || !Array.isArray(c.labels) || !c.labels.length ||
        c.labels.length > 100 || !c.labels.every(text) || !Array.isArray(c.sections) ||
        c.sections.length > 100 || !c.sections.every(text))) throw new Error('Invalid match request')
  return { field: { fieldName: field.fieldName, section: field.section, fieldType: field.fieldType },
    candidates: candidates.map(c => ({ id: c.id, labels: c.labels, sections: c.sections })) }
}

function createBridgeServer({ apiKey, token, request = fetch }) {
  let active = 0, used = 0, windowStart = Date.now()
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(data))
    }
    // No CORS access for websites. Only the paired extension knows this token.
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Unauthorized' })
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return send(403, { error: 'Invalid host' })
    if (req.url !== '/match' || req.method !== 'POST') return send(404, { error: 'Not found' })
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' })
    if (!apiKey) return send(503, { error: 'OPENAI_API_KEY is not set' })
    if (Date.now() - windowStart >= 60000) { used = 0; windowStart = Date.now() }
    if (active >= 4 || used >= 100) return send(429, { error: 'Matching limit reached' })
    active++
    try {
      const chunks = []
      let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 262144) { send(413, { error: 'Request too large' }); return }
        chunks.push(chunk)
      }
      let input
      try { input = validateInput(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
      catch { return send(400, { error: 'Invalid match request' }) }
      used++
      const entryId = await selectProfileEntry(input.field, input.candidates, { apiKey }, request)
      send(200, { entryId })
    } catch {
      // Never return provider response bodies, prompts, or the API key.
      send(502, { error: 'OpenAI matching failed. Check API credentials and quota.' })
    } finally { active-- }
  })
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY in your environment or the project .env file, then run npm run ai:server.')
    process.exitCode = 1
  } else {
    const server = createBridgeServer({ apiKey, token: require('./bridgeToken.cjs')() })
    server.requestTimeout = 10000
    server.on('error', error => { console.error(`Local AI service could not start (${error.code}).`); process.exitCode = 1 })
    server.listen(43187, '127.0.0.1', () => console.log('Job App Filler AI service ready on 127.0.0.1:43187 (gpt-6-luna).'))
  }
}

module.exports = { createBridgeServer, validateInput }
