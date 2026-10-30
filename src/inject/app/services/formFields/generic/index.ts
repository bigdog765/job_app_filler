import { GenericInput } from './GenericInput'
import { Control, discoverControls, isUsable } from './dom'

/** Observe dynamic forms without rescanning on every keystroke or widget render. */
export function startGenericForms(document: Document, prepare: () => Promise<void>) {
  const registered = new Map<Control, GenericInput>()
  let forced = false
  let timer: ReturnType<typeof setTimeout>
  let scanning = false
  let rescan = false
  let pending: Promise<number>

  const scan = async (): Promise<number> => {
    if (scanning) { rescan = true; return pending }
    scanning = true
    pending = (async () => {
      for (const [control, backend] of registered) {
        if (!control.isConnected || !isUsable(control)) {
          backend.dispose()
          registered.delete(control)
        }
      }
      const controls = discoverControls(document, forced)
      if (controls.length) await prepare()
      for (const control of controls) {
        if (!registered.has(control) && isUsable(control)) {
          registered.set(control, new GenericInput(control))
        }
      }
      return registered.size
    })()
    try { return await pending }
    finally {
      scanning = false
      if (rescan) { rescan = false; schedule() }
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => { scan().catch(console.error) }, 100)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'disabled', 'readonly', 'aria-hidden', 'aria-label', 'name', 'type'],
  })
  schedule()
  return {
    enable: async () => { forced = true; return scan() },
    stop: () => {
      clearTimeout(timer)
      observer.disconnect()
      registered.forEach((backend) => backend.dispose())
      registered.clear()
    },
  }
}
