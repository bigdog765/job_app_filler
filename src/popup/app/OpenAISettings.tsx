import React, { useEffect, useState } from 'react'
import { Alert, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material'

export function OpenAISettings() {
  const [enabled, setEnabled] = useState(true)
  const [status, setStatus] = useState('')
  useEffect(() => {
    chrome.storage.session.get(['openaiEnabled', 'openaiStatus']).then(values => {
      setEnabled(values.openaiEnabled !== false)
      setStatus(values.openaiStatus || '')
    })
    const changed = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'session' && changes.openaiStatus) setStatus(changes.openaiStatus.newValue || '')
    }
    chrome.storage.onChanged.addListener(changed)
    return () => chrome.storage.onChanged.removeListener(changed)
  }, [])
  async function reset() {
    await chrome.storage.session.set({ openaiReset: Date.now(), openaiStatus: 'Ready. Refresh the form to retry matching.' })
  }
  return <Stack spacing={1} sx={{ my: 2 }}>
    <Typography variant="h6">OpenAI profile matching</Typography>
    <Typography variant="body2">Model: gpt-6-luna. Matches unresolved field labels to your local profile.
      Labels and sections are sent to OpenAI; answer values stay local. API usage is billed to your account.</Typography>
    <Typography variant="caption">Run npm run ai:server with OPENAI_API_KEY set in your environment or .env file.</Typography>
    <FormControlLabel label="Enable AI matching" control={<Switch checked={enabled} onChange={async (_, checked) => {
      await chrome.storage.session.set({ openaiEnabled: checked, openaiStatus: checked ? 'Enabled. Refresh the form.' : 'AI matching disabled.' })
      setEnabled(checked)
    }} />} />
    <Button onClick={reset}>Reset matching</Button>
    {status && <Alert severity="info">{status}</Alert>}
  </Stack>
}
