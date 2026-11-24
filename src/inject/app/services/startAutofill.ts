import { contentScriptAPI } from './contentScriptApi'

// Defer until the site's subclass constructor has initialized its field type.
// Autofill has no dependency on mounting a React widget or editor.
export function startAutofill(field: { fill(): Promise<void> }) {
  const report = (event: string) => {
    contentScriptAPI.send('reportExecutionEvent', { event }).catch(() => {})
  }
  return Promise.resolve().then(async () => {
    report('start')
    try {
      await field.fill()
      report('complete')
    } catch {
      report('error')
    }
  })
}
