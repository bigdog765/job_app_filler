import { FieldPath } from '@src/shared/utils/types'
import { isRequiredField } from '@src/shared/utils/fieldRequirement'
import { fieldMeaning, sectionMeaning } from '@src/shared/utils/profileSemantics'
import { Control, discoverControls, fieldLabel, fieldSection, controlType, currentValue,
  fillControl, isUsable, isConsent, normalize } from './dom'

function nearbySection(control: Control): string {
  const explicit = fieldSection(control)
  if (explicit) return sectionMeaning(explicit)
  const root = control.form || control.ownerDocument.body
  const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,[role="heading"]'))
    .filter((heading) => !heading.closest('[data-jaf-ui], [hidden], [aria-hidden="true"]') &&
      !!(heading.compareDocumentPosition(control) & 4))
  // The closest preceding section heading bounds context; do not bleed work
  // history into a later references, education or personal-information section.
  const heading = headings.pop()
  const text = (heading?.textContent || '').trim()
  return /^(?:submit your application|application form|job application|apply now)$/i.test(text)
    ? '' : sectionMeaning(text)
}

type InferredFieldPath = FieldPath & { inference?: string }

export function describeProfileFields(controls: Control[]): InferredFieldPath[] {
  const sections = controls.map(nearbySection)
  return controls.map((control, index) => {
    let section = sections[index]
    let inference: string
    if (section === 'Work Experience' || section === 'Education') {
      const peers = controls.filter((other, i) => other.form === control.form && sections[i] === section)
      const anchorTypes = section === 'Work Experience' ? ['Company', 'Job Title'] : ['School', 'Field of Study']
      // Employer/school controls may be custom widgets, hidden, or absent. A
      // recognized job title is equally useful for locating a work record.
      // Prefer the most repeated anchor so a single employer field cannot collapse
      // multiple visible roles into Work Experience 1. Ties favor company/school.
      const candidates = anchorTypes.map((meaning) => ({ meaning,
        controls: peers.filter((other) => fieldMeaning(fieldLabel(other), section) === meaning) }))
      const best = candidates.reduce((a, b) => b.controls.length > a.controls.length ? b : a)
      const anchors = best.controls
      // Identify a repeated record by a common container with exactly one anchor.
      // An ambiguous layout is left unmatched rather than mixing two employers.
      let record: Control
      for (let parent = control.parentElement; parent && parent !== control.form; parent = parent.parentElement) {
        const contained = anchors.filter((other) => parent.contains(other))
        if (contained.length === 1) { record = contained[0]; break }
        if (contained.length > 1) break
      }
      if (!record && anchors.length === 1) record = anchors[0]
      if (record) {
        section += ` ${anchors.indexOf(record) + 1}`
        inference = `Inferred ${section} from the section heading and ${best.meaning.toLowerCase()} fields in page order.`
      }
    }
    return { section, fieldName: fieldLabel(control), fieldType: controlType(control),
      required: isRequiredField(control, fieldLabel(control)),
      page: control.ownerDocument.title, ...(inference && { inference }) }
  })
}

const snapshot = (control: Control) => JSON.stringify({ value: currentValue(control), raw: control.value })
export function matchesProfileAnswer(control: Control, answer: any): boolean {
  const current = currentValue(control)
  if (controlType(control) === 'SimpleDropdown') {
    return (Array.isArray(answer) ? answer : [answer]).some((value) =>
      typeof value === 'string' && [current, control.value].some((v) => normalize(v) === normalize(value)))
  }
  return JSON.stringify(current) === JSON.stringify(answer)
}

/** Plans remain in the isolated content script; the popup applies opaque IDs only. */
export function createProfileReview(document: Document, suggest: (path: FieldPath) => Promise<any>) {
  let generation = 0
  let plans = new Map<string, { control: Control; path: FieldPath; before: string; answer: any;
    members: Array<{ control: Control; before: string }> }>()
  return {
    async scan() {
      const version = ++generation
      plans = new Map()
      const controls = discoverControls(document, true)
      const paths = describeProfileFields(controls)
      const snapshots = controls.map(snapshot)
      const rows = await Promise.all(controls.map(async (control, i) => {
        const path = paths[i]
        const before = snapshot(control)
        const existing = currentValue(control)
        const answer = await suggest(path)
        const id = `${version}:${i}`
        const unchanged = before === snapshot(control)
        const status = !unchanged ? 'changed' : answer === undefined ? 'unmatched' : matchesProfileAnswer(control, answer) ? 'current' : 'update'
        const members = controls.flatMap((member, j) => member.form === control.form &&
          paths[j].section === path.section && /^(Work Experience|Education) \d+$/.test(path.section)
          ? [{ control: member, before: snapshots[j] }] : [])
        if (status === 'update' && version === generation) plans.set(id, { control, path, before, answer, members })
        return { id, label: path.fieldName, section: path.section, existing, suggested: answer,
          status, reason: /^(Work Experience|Education) \d+$/.test(path.section)
            ? `${path.inference || `${path.section} in your profile, matched by record order.`} Check that the records line up. Source: local profile.`
            : 'Matched using the field label and section. Source: local profile.' }
      }))
      return { rows }
    },
    apply(ids: string[]) {
      let applied = 0, skipped = 0
      const controls = discoverControls(document, true)
      const paths = describeProfileFields(controls)
      // Validate all snapshots before our own writes fire site change handlers.
      const valid = new Set([...plans].filter(([, plan]) => {
        const index = controls.indexOf(plan.control)
        return index >= 0 && JSON.stringify(paths[index]) === JSON.stringify(plan.path) &&
          snapshot(plan.control) === plan.before && plan.members.every((member) =>
            member.control.isConnected && snapshot(member.control) === member.before)
      }).map(([id]) => id))
      for (const id of new Set(ids)) {
        const plan = plans.get(id)
        if (!plan || !valid.has(id) || !isUsable(plan.control) || isConsent(plan.control) || snapshot(plan.control) !== plan.before) {
          skipped++; continue
        }
        fillControl(plan.control, [plan.answer])
        if (matchesProfileAnswer(plan.control, plan.answer)) applied++
        else skipped++
        plans.delete(id)
      }
      return { applied, skipped }
    },
  }
}
