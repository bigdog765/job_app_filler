export type LogEvent = { id: number; time: string; level: 'info' | 'warn' | 'error'; message: string }
let sequence = 0
let events: LogEvent[] = []
export function logEvent(message: string, level: LogEvent['level'] = 'info') {
  const event = { id: ++sequence, time: new Date().toISOString(), level, message }
  events.push(event)
  if (events.length > 300) events.shift()
  console[level === 'info' ? 'log' : level]('[Job App Filler]', message)
}
export const getExecutionLog = () => events.map(event => ({ ...event }))
export const clearExecutionLog = () => { events = [] }
