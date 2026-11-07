import { findRepeatedSectionHeading } from '../workday/sectionHeading'

export type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
export const controlSelector = 'input, textarea, select'
const uiSelector = '[data-jaf-ui], .jaf-widget'
const textTypes = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'month'])
export const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/\(\s*(?:required|optional)\s*\)/g, '').replace(/[\s*:✱✲✳∗⁎]+/g, ' ').trim()

function readableName(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-\[\]]+/g, ' ').trim()
}

function cleanText(element: Element): string {
  // Lever wraps its caption, control and live dropdown messages in one label.
  // Use its caption when present so suggestion text cannot change the field name.
  const caption = element.querySelector(':scope > .application-label')
  const clone = (caption || element).cloneNode(true) as Element
  clone.querySelectorAll(`${uiSelector}, input, textarea, select`).forEach((node) => node.remove())
  return (clone.textContent || '').replace(/\s+/g, ' ').trim()
}

function ariaLabel(element: Element): string {
  const ids = (element.getAttribute('aria-labelledby') || '').split(/\s+/)
  return ids.map((id) => element.ownerDocument.getElementById(id))
    .filter(Boolean).map(cleanText).join(' ') || element.getAttribute('aria-label') || ''
}

export function controlLabel(control: Control): string {
  const explicit = Array.from(control.labels || []).map(cleanText).filter(Boolean).join(' ')
  if (explicit) return explicit
  const aria = ariaLabel(control)
  if (aria) return aria
  const autocomplete = (control.getAttribute('autocomplete') || '').split(/\s+/).pop()
  const names: Record<string, string> = {
    'given-name': 'First Name', 'family-name': 'Last Name', name: 'Full Name',
    email: 'Email', tel: 'Phone Number', 'address-level2': 'City',
    'address-level1': 'State', 'postal-code': 'Postal Code',
    'address-line1': 'Address Line 1', 'address-line2': 'Address Line 2',
    'country-name': 'Country',
  }
  return names[autocomplete] || readableName(control.name || control.id) ||
    control.getAttribute('placeholder') || ''
}

export function radioControls(control: HTMLInputElement): HTMLInputElement[] {
  if (!control.name) return [control]
  const root = control.form || control.closest('[role="form"]') || control.ownerDocument
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    .filter((radio) => radio.name === control.name && radio.form === control.form)
}

export function fieldLabel(control: Control): string {
  if (control instanceof control.ownerDocument.defaultView.HTMLInputElement && control.type === 'radio') {
    const group = control.closest('[role="radiogroup"], fieldset')
    if (group) {
      const legend = group.querySelector(':scope > legend')
      return ariaLabel(group) || (legend && cleanText(legend)) || readableName(control.name)
    }
    return readableName(control.name)
  }
  return controlLabel(control)
}

export function controlType(control: Control): string {
  if (control.tagName === 'SELECT') return (control as HTMLSelectElement).multiple ? 'MultiSelect' : 'SimpleDropdown'
  if (control.tagName === 'TEXTAREA') return 'TextInput'
  switch (control.type) {
    case 'checkbox': return 'SingleCheckbox'
    case 'radio': return 'BooleanRadio'
    case 'month': return 'MonthYear'
    case 'date': return 'DateInput'
    default: return 'TextInput'
  }
}

export function isUsable(control: Control): boolean {
  if (!control.isConnected || control.matches(':disabled') ||
      ('readOnly' in control && control.readOnly) || control.closest(uiSelector)) return false
  if (control.tagName === 'INPUT' && control.matches('[role="combobox"], [aria-haspopup="listbox"], [aria-autocomplete="list"], [aria-autocomplete="both"]')) return false
  // Lever's location requires a selected structured result, not just visible text.
  if (control.closest('[data-qa="structured-contact-location-question"]')) return false
  if (control.tagName === 'INPUT' && !textTypes.has(control.type) &&
      !['checkbox', 'radio'].includes(control.type)) return false
  if (control.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  const view = control.ownerDocument.defaultView
  for (let node: Element = control; node; node = node.parentElement) {
    const style = view.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return control.getClientRects().length > 0
}

export function isConsent(control: Control): boolean {
  return /\b(agree|consent|certify|attest|signature|terms|privacy|subscribe|newsletter)\b/i.test(fieldLabel(control))
}

export function fieldSection(control: Control): string {
  let heading = findRepeatedSectionHeading(control)
  if (!heading && control.type === 'radio') {
    const group = control.closest<HTMLElement>('[role="radiogroup"], fieldset')
    if (group) heading = findRepeatedSectionHeading(group)
  }
  return (heading?.textContent || '').replace(/\s+/g, ' ').trim()
}

export function isApplicationForm(container: Element): boolean {
  if (container.querySelector('input[type="password"]')) return false
  const controls = Array.from(container.querySelectorAll<Control>(controlSelector))
    .filter((control) => !control.closest(uiSelector))
  const labels = controls.map((control) => normalize(controlLabel(control)))
  const identityCount = labels.filter((label) =>
    /^(?:(?:your|legal) )?(?:(?:first|last|full|given|family) name|name|e-?mail(?: address)?|phone(?: number)?)\s*\*?$/i.test(label.trim())
  ).length
  const jobField = labels.some((label) =>
    /\b(resume|résumé|cv|cover letter|work experience|employment history|current employer|most recent employer|work authorization|sponsorship|position applying|relevant skills)\b/i.test(label))
  const heading = container.querySelector('h1, h2, h3, h4, h5, h6, legend, [role="heading"]')
  const context = readableName([
    container.id, container.getAttribute('name'), ariaLabel(container), heading?.textContent,
  ].filter(Boolean).join(' '))
  const applicationContext = /\b(job application|employment application|application form|apply for|apply now)\b/i.test(context)
  if (/\b(newsletter|subscribe|search|sign in|log in)\b/i.test(context)) return false
  // Multi-step applications may show only employment fields on this page.
  const workHeading = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,[role="heading"]'))
    .some((node) => /^(?:work experience|professional experience|employment history|work history)(?:\s*\d+)?$/i.test(normalize(node.textContent || '')))
  if (workHeading && labels.some((label) => /^(?:job title|role title|position title|what (?:is|was) your job title)$/.test(label.replace(/\?$/, '')))) return true
  return controls.length >= 2 && ((identityCount >= 1 && jobField) ||
    (applicationContext && (identityCount >= 1 || jobField)))
}

export function discoverControls(document: Document, force = false): Control[] {
  const containers = Array.from(document.querySelectorAll('form, [role="form"]'))
  // Some framework forms use only a main/section container.
  if (!containers.length) containers.push(...Array.from(document.querySelectorAll('main, section')))
  if (!containers.length && document.body) containers.push(document.body)
  const found = new Set<Control>()
  for (const container of containers) {
    if (container.closest(uiSelector) || (!force && container.querySelector('input[type="password"]'))) continue
    if (!force && !isApplicationForm(container)) continue
    for (const control of Array.from(container.querySelectorAll<Control>(controlSelector))) {
      if (!isUsable(control) || !fieldLabel(control) || isConsent(control)) continue
      if (control.type === 'radio' && radioControls(control as HTMLInputElement).find(isUsable) !== control) continue
      found.add(control)
    }
  }
  return [...found]
}

export function currentValue(control: Control): any {
  switch (controlType(control)) {
    case 'SingleCheckbox': return (control as HTMLInputElement).checked
    case 'BooleanRadio': {
      const checked = radioControls(control as HTMLInputElement).find((radio) => radio.checked)
      return checked ? controlLabel(checked) || checked.value : ''
    }
    case 'SimpleDropdown': return (control as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() || ''
    case 'MultiSelect': return Array.from((control as HTMLSelectElement).selectedOptions).map((option) => option.textContent.trim())
    case 'MonthYear': return control.value ? control.value.split('-').reverse() : ['', '']
    default: return control.value
  }
}

export function isEmpty(control: Control): boolean {
  if (control.type === 'radio') return !radioControls(control as HTMLInputElement).some((radio) => radio.checked)
  if (control.type === 'checkbox') return !(control as HTMLInputElement).checked
  if (control.tagName === 'SELECT' && (control as HTMLSelectElement).multiple) {
    return !(control as HTMLSelectElement).selectedOptions.length
  }
  return !control.value.trim()
}

function changeEvents(control: Control): void {
  const view = control.ownerDocument.defaultView
  control.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }))
  control.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }))
}

/** Use the native setter so React's value tracker sees the subsequent input event. */
export function fillControl(control: Control, answers: any[]): void {
  if (!isUsable(control) || isConsent(control) || !answers.length) return
  const type = controlType(control)
  if (type === 'SimpleDropdown' || type === 'MultiSelect') {
    const choices = answers.flat().filter((value) => typeof value === 'string').map(normalize)
    const select = control as HTMLSelectElement
    const options = Array.from(select.options).filter((option) =>
      !option.disabled && !option.closest('optgroup[disabled]') && option.value !== '')
    const matches = choices.map((choice) => options.find((option) =>
      normalize(option.textContent || '') === choice || normalize(option.value) === choice)).filter(Boolean)
    if (!matches.length) return
    if (select.multiple) options.forEach((option) => { option.selected = matches.includes(option) })
    else select.value = matches[0].value
    changeEvents(select)
    return
  }
  if (type === 'SingleCheckbox') {
    if (typeof answers[0] === 'boolean' && (control as HTMLInputElement).checked !== answers[0]) control.click()
    return
  }
  if (type === 'BooleanRadio') {
    const choices = answers.filter((value) => typeof value === 'string').map(normalize)
    const radio = radioControls(control as HTMLInputElement).find((radio) => isUsable(radio) &&
      choices.some((choice) => normalize(controlLabel(radio)) === choice || normalize(radio.value) === choice))
    if (radio && !radio.checked) radio.click()
    return
  }
  let value = answers[0]
  if (type === 'MonthYear') {
    if (!Array.isArray(value) || value.length !== 2) return
    value = `${value[1]}-${String(value[0]).padStart(2, '0')}`
  }
  if (typeof value !== 'string' || !value.trim()) return
  if (type === 'DateInput' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return
  const view = control.ownerDocument.defaultView
  const prototype = control.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set
  const previous = control.value
  setter.call(control, value)
  if (!control.value && value) { setter.call(control, previous); return }
  changeEvents(control)
}
