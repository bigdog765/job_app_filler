import React, { useEffect, useRef, useState } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import type { LogEvent } from '../../contentScript/executionLog'

export function ExecutionConsole() {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('Connecting…')
  const output = useRef<HTMLDivElement>(null)
  const tabId = useRef<number>()
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        tabId.current = tab.id
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_EXECUTION_LOG' }, { frameId: 0 })
        if (!Array.isArray(result)) throw new Error('Unavailable')
        if (!disposed) { setEvents(result); setStatus('Live · current page, main frame') }
      } catch {
        if (!disposed) { setEvents([]); setStatus('Open a supported page and refresh it after reloading the extension.') }
      } finally { if (!disposed) timer = setTimeout(refresh, 1000) }
    }
    if (!paused) refresh()
    return () => { disposed = true; clearTimeout(timer) }
  }, [paused])
  useEffect(() => {
    if (output.current) output.current.scrollTop = output.current.scrollHeight
  }, [events.length, events[events.length - 1]?.id])
  async function clear() {
    try {
      await chrome.tabs.sendMessage(tabId.current, { type: 'CLEAR_EXECUTION_LOG' }, { frameId: 0 })
      setEvents([])
    } catch { setStatus('Could not clear logs. Refresh the application page.') }
  }
  return <Box sx={{ my: 2 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Typography variant="h6">Execution console</Typography>
      <Stack direction="row">
        <Button size="small" onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</Button>
        <Button size="small" onClick={clear}>Clear</Button>
      </Stack>
    </Stack>
    <Typography variant="caption">{paused ? 'Display paused; events continue recording.' : status}</Typography>
    <Box ref={output} role="region" aria-label="Extension execution log" tabIndex={0}
      sx={{ bgcolor: '#101820', color: '#d3e6df', border: '1px solid #38504a', borderRadius: 1,
        p: 1.5, height: 300, overflow: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {!events.length && <span>No events recorded.</span>}
      {events.map(event => <div key={event.id} style={{ color: event.level === 'error' ? '#ff9b9b' : event.level === 'warn' ? '#ffda85' : undefined }}>
        {new Date(event.time).toLocaleTimeString()} [{event.level.toUpperCase()}] {event.message}
      </div>)}
    </Box>
    <Typography variant="caption">Last 300 events. Resets on page reload. Profile answers are excluded.</Typography>
  </Box>
}
