import { FieldPath } from '@src/shared/utils/types'
import { describeProfileFields, matchesProfileAnswer } from './profileReview'
import { Control, currentValue, discoverControls, fillControl, isUsable, isConsent, radioControls } from './dom'

const snapshot = (control: Control) => JSON.stringify({ value: currentValue(control), raw: control.value })

/** Apply profile inference once per field/context; never fight subsequent edits. */
export function createProfileAutofill(document: Document, suggest: (path: FieldPath) => Promise<any>) {
  const touched = new WeakSet<Control>()
  const attempted = new WeakMap<Control, string>()
  const applied = new WeakSet<Control>()
  let writing = false
  let stopped = false
  const onEdit = (event: Event) => {
    if (writing) return
    const control = event.target as Control
    if (!control?.matches?.('input, textarea, select')) return
    touched.add(control)
    if (control.type === 'radio') radioControls(control as HTMLInputElement).forEach((radio) => touched.add(radio))
  }
  document.addEventListener('input', onEdit, true)
  document.addEventListener('change', onEdit, true)
  return {
    protects: (control: Control) => touched.has(control) || applied.has(control),
    async fill(controls: Control[]) {
      if (stopped) return
      const paths = describeProfileFields(controls)
      const before = controls.map(snapshot)
      const signatures = controls.map((control, i) => JSON.stringify([paths[i],
        control.tagName === 'SELECT' ? Array.from((control as HTMLSelectElement).options)
          .map((option) => [option.value, option.textContent, option.disabled, !!option.closest('optgroup[disabled]')]) : null]))
      const answers = await Promise.all(controls.map((control, i) =>
        touched.has(control) || applied.has(control) || attempted.get(control) === signatures[i]
          ? undefined : suggest(paths[i])))
      if (stopped) return
      const usable = discoverControls(document, true)
      const latestPaths = describeProfileFields(usable)
      // Validate the entire record before writes, so an employer edit also
      // protects its role, dates and description from an obsolete lookup.
      const valid = controls.map((control, i) => {
        const index = usable.indexOf(control)
        return index >= 0 && !touched.has(control) && snapshot(control) === before[i] &&
          JSON.stringify(latestPaths[index]) === JSON.stringify(paths[i])
      })
      for (let i = 0; i < controls.length; i++) {
        const control = controls[i]
        const recordUnchanged = !/^(Work Experience|Education) \d+$/.test(paths[i].section) ||
          controls.every((peer, j) => peer.form !== control.form || paths[j].section !== paths[i].section || valid[j])
        if (answers[i] === undefined || !valid[i] || !recordUnchanged || touched.has(control) ||
            !isUsable(control) || isConsent(control) || snapshot(control) !== before[i]) continue
        attempted.set(control, signatures[i])
        writing = true
        try {
          fillControl(control, [answers[i]])
          if (matchesProfileAnswer(control, answers[i])) applied.add(control)
        }
        finally { writing = false }
      }
    },
    stop() {
      stopped = true
      document.removeEventListener('input', onEdit, true)
      document.removeEventListener('change', onEdit, true)
    },
  }
}
