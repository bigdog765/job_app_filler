import { isApplicationForm } from '@src/inject/app/services/formFields/generic/dom'

import { isAcknowledgment } from '@src/shared/utils/acknowledgment'

function labelFor(control: HTMLElement): string {
  const referenced = (control.getAttribute('aria-labelledby') || '').split(/\s+/)
    .map(id => control.ownerDocument.getElementById(id)).filter(Boolean)
  const labels = Array.from((control as HTMLInputElement).labels || [])
  const nodes = referenced.length ? referenced : labels
  if (nodes.length) return nodes.map(node => {
    const clone = node.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-jaf-ui], .jaf-widget, input, textarea, select').forEach(child => child.remove())
    return clone.textContent || ''
  }).join(' ')
  return control.getAttribute('aria-label') || (control.getAttribute('role') === 'checkbox' ? control.textContent : '') || ''
}

export function startAcknowledgments(document: Document, specialized: boolean) {
  const touched = new WeakSet<HTMLElement>()
  const attempts = new WeakMap<HTMLElement, number>()
  let writing = false, forced = false, stopped = false
  let timer: ReturnType<typeof setTimeout>
  const selector = 'input[type="checkbox"], [role="checkbox"]'
  const onEdit = (event: Event) => {
    if (writing) return
    const target = event.target as HTMLElement
    const control = target.closest?.<HTMLElement>(selector)
    if (control) touched.add(control)
  }
  document.addEventListener('input', onEdit, true)
  document.addEventListener('change', onEdit, true)
  document.addEventListener('click', onEdit, true)
  const scan = () => {
    if (stopped) return
    for (const control of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (control.querySelector('input[type="checkbox"]') || touched.has(control) || (attempts.get(control) || 0) >= 3 ||
          control.closest('[data-jaf-ui], .jaf-widget, [inert], [hidden], [aria-hidden="true"], [aria-disabled="true"]') ||
          control.matches(':disabled, [readonly], button:not([type="button"]), a[href]') || !control.getClientRects().length) continue
      let visible = true
      for (let node: HTMLElement = control; node; node = node.parentElement) {
        const style = document.defaultView.getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') { visible = false; break }
      }
      if (!visible) continue
      const container = control.closest('form, [role="form"], .application--container') || document.body
      if (!specialized && !forced && !isApplicationForm(container)) continue
      if (!isAcknowledgment(labelFor(control))) continue
      const checked = () => control.matches('input') ? (control as HTMLInputElement).checked : control.getAttribute('aria-checked') === 'true'
      if (checked()) continue
      writing = true
      try {
        attempts.set(control, (attempts.get(control) || 0) + 1)
        control.click()
      } finally { writing = false }
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, 100) }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'disabled', 'aria-disabled', 'aria-label', 'aria-labelledby', 'role', 'type', 'class', 'style'] })
  schedule()
  return {
    enable() { forced = true; scan() },
    stop() {
      stopped = true; clearTimeout(timer); observer.disconnect()
      document.removeEventListener('input', onEdit, true)
      document.removeEventListener('change', onEdit, true)
      document.removeEventListener('click', onEdit, true)
    },
  }
}
