import React, { useState } from 'react'
import { Box, Button, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material'

type ReviewRow = {
  id: string; label: string; section: string; existing: any; suggested?: any;
  status: string; reason: string;
}
const display = (value: any) => value === undefined || value === '' ? '(empty)' :
  typeof value === 'boolean' ? (value ? 'Yes' : 'No') : Array.isArray(value) ? value.join(' / ') : String(value)

export function ProfileReview() {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [tabId, setTabId] = useState<number>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const scan = async () => {
    setBusy(true); setRows([]); setSelected([])
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'REVIEW_PROFILE' }, { frameId: 0 })
      if (!result.ok) throw new Error(result.specialized
        ? 'Profile review currently supports standard company forms. This site uses a dedicated adapter.'
        : 'Could not read this form. Refresh the page and try again.')
      setTabId(tab.id); setRows(result.rows)
      const count = result.rows.filter((row: ReviewRow) => row.status === 'update').length
      const unmatched = result.rows.filter((row: ReviewRow) => row.status === 'unmatched').length
      setMessage(`${count} suggested updates. ${unmatched} fields have no profile match. Hidden fields and custom controls are excluded.`)
    } catch (error) { setMessage(error.message || 'Refresh the page after reloading the extension.') }
    finally { setBusy(false) }
  }
  const apply = async () => {
    setBusy(true)
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'APPLY_PROFILE_UPDATES', ids: selected }, { frameId: 0 })
      if (!result.ok) throw new Error('Could not apply updates. Review the form again.')
      setMessage(`Updated ${result.applied} fields; skipped ${result.skipped}. Check the form before submitting. Review again to see remaining differences.`)
      setRows([]); setSelected([])
    } catch (error) { setMessage(error.message || 'Refresh the page and review again.') }
    finally { setBusy(false) }
  }
  return <Box sx={{ my: 2 }}>
    <Button variant="outlined" disabled={busy} onClick={scan}>Review profile updates</Button>
    <Typography variant="body2" sx={{ my: 1 }}>
      Inferred profile matches fill automatically, including outdated website answers.
      Review remaining differences below. Your edits are preserved; select a replacement to override one.
      Work history is mapped in profile order, newest first.
    </Typography>
    {message && <Typography role="status" variant="body2">{message}</Typography>}
    {rows.length > 0 && <Stack spacing={1} sx={{ mt: 1, maxHeight: 380, overflowY: 'auto', minWidth: 360 }}>
      {rows.map((row) => <Box key={row.id} sx={{ border: '1px solid #ddd', p: 1, overflowWrap: 'anywhere' }}>
        {row.status === 'update' ? <FormControlLabel label={`${row.section ? row.section + ' — ' : ''}${row.label}`}
          control={<Checkbox disabled={busy} checked={selected.includes(row.id)} onChange={(_, checked) =>
            setSelected((previous) => checked ? [...previous, row.id] : previous.filter((id) => id !== row.id))} />} />
          : <Typography variant="subtitle2">{row.section} {row.label}</Typography>}
        <Typography variant="body2">On form: {display(row.existing)}</Typography>
        {(row.status === 'update' || row.status === 'current') && <Typography variant="body2">Profile: {display(row.suggested)}</Typography>}
        <Typography variant="caption">{row.status === 'unmatched' ? 'No profile match found for this field and section. Fill manually or add a matching profile entry.' :
          row.status === 'changed' ? 'Changed during review. Scan again.' : row.status === 'current' ? 'Already matches.' : row.reason}</Typography>
      </Box>)}
    </Stack>}
    {selected.length > 0 && <Button sx={{ mt: 1 }} variant="contained" disabled={busy} onClick={apply}>
      Apply {selected.length} selected updates
    </Button>}
  </Box>
}
