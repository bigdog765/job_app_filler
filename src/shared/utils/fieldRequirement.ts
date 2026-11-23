export function isRequiredField(element: HTMLElement, label = ''): boolean {
  const selector = 'input:not([type="hidden"]):not([type="search"]), textarea, select, [role="checkbox"], [role="combobox"], [role="radiogroup"]'
  const controls = (element.matches(selector) ? [element] : Array.from(element.querySelectorAll<HTMLElement>(selector)))
    .filter(control => !control.closest('[data-jaf-ui], .jaf-widget, .iti__country-container'))
  const nodes = [element, ...controls]
  const radio = controls.find(control => control.matches('input[type="radio"]')) as HTMLInputElement
  const checkboxSelector = 'input[type="checkbox"], [role="checkbox"]'
  const fieldset = element.matches(checkboxSelector) ? element.closest('fieldset') : null
  // A required legend can describe a choice among several options. Only inherit
  // it when this checkbox is the fieldset's sole field.
  const singleFieldset = fieldset?.querySelectorAll(selector).length === 1 ? fieldset : null
  const group = radio?.closest<HTMLElement>('fieldset, [role="radiogroup"]') || singleFieldset
  if (group) nodes.push(group)
  if (radio?.name) nodes.push(...Array.from((radio.form || radio.ownerDocument)
    .querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(peer => peer.name === radio.name && peer.form === radio.form))
  if (nodes.some(node => node.hasAttribute('required') || node.getAttribute('aria-required') === 'true')) return true
  if (nodes.some(node => node.getAttribute('aria-required') === 'false')) return false
  const labels = controls.flatMap(control => [
    ...Array.from((control as HTMLInputElement).labels || []),
    ...(control.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => element.ownerDocument.getElementById(id)).filter(Boolean),
  ])
  const legend = (group || (element.matches('fieldset') ? element : null))?.querySelector(':scope > legend')
  if (legend) labels.push(legend as HTMLElement)
  const text = [label, ...labels.map(node => {
    const clone = node.cloneNode(true) as HTMLElement
    clone.querySelectorAll('[data-jaf-ui], .jaf-widget, input, textarea, select').forEach(child => child.remove())
    return clone.textContent || ''
  })].join(' ')
  return !/\boptional\b|\bnot required\b/i.test(text) && /\brequired\b|[*✱✲✳∗⁎]/.test(text.toLowerCase())
}
