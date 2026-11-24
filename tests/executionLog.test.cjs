const { test } = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./helpers/loadTs.cjs')

test('execution logs are bounded, isolated snapshots and clearable; console receives severity', () => {
  const calls = []
  const log = loadTs('src/contentScript/executionLog.ts', {}, {
    console: { log: (...args) => calls.push(['info', ...args]), warn: (...args) => calls.push(['warn', ...args]), error: (...args) => calls.push(['error', ...args]) },
  })
  for (let i = 0; i < 305; i++) log.logEvent(`Event ${i}`)
  const events = log.getExecutionLog()
  assert.equal(events.length, 300)
  assert.equal(events[0].message, 'Event 5')
  events[0].message = 'changed'
  assert.equal(log.getExecutionLog()[0].message, 'Event 5')
  log.logEvent('Failed', 'error')
  assert.equal(calls.at(-1)[0], 'error')
  log.clearExecutionLog()
  assert.deepEqual(log.getExecutionLog(), [])
})
