import React, { useEffect, useState } from 'react'
import { Alert, Typography } from '@mui/material'

export function ProfileStatus() {
  const [status, setStatus] = useState<{ ready: boolean; entryCount: number; errors: string[] }>()
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PROFILE_STATUS' }, { frameId: 0 })
        if (!result || !Array.isArray(result.errors)) throw new Error('Unavailable')
        if (active) setStatus(result)
      } catch { if (active) setUnavailable(true) }
    })()
    return () => { active = false }
  }, [])
  return <>
    <Typography variant="h6">Local profile</Typography>
    {status && <Alert severity={status.ready ? 'info' : 'error'}>
      {status.ready ? `${status.entryCount} populated profile entries loaded.` : status.errors.join(' ')}
    </Alert>}
    {unavailable && <Typography>Open a supported application page and refresh it to check the loaded profile.</Typography>}
    <Typography variant="body2" sx={{ my: 1 }}>
      Answers come from profile.local.json. Edit the file, rebuild, reload the extension,
      and refresh the page to apply changes. Website Save/Edit controls are read-only.
    </Typography>
  </>
}
