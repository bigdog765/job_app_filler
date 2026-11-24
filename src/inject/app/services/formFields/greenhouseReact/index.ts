import { AddressSearchable } from './AddressSearchable'
import { CheckboxBoolean } from './CheckboxBoolean'
import { CheckboxMulti } from './CheckboxMulti'
import { DropdownMultiSearchable } from './DropdownMultiSearchable'
import { DropdownSearchable } from './DropdownSearchable'
import { File } from './File'
import { NumberInput } from './NumberInput'
import { Section } from './Section'
import { Textarea } from './Textarea'
import { TextInput } from './TextInput'
import { contentScriptAPI } from '../../contentScriptApi'
import { isRequiredField } from '@src/shared/utils/fieldRequirement'
import { CountryCode } from './CountryCode'

let hydrationRetry: ReturnType<typeof setTimeout>
let retryCount = 0

const inputs = [
  CountryCode,
  TextInput,
  Textarea,
  File,
  DropdownMultiSearchable,
  DropdownSearchable,
  CheckboxMulti,
  CheckboxBoolean,
  NumberInput,
  AddressSearchable,
]

export const RegisterInputs = async (node: Node = document) => {
  // Greenhouse serves the fields as HTML before React attaches its handlers.
  // Adding widgets/filling at that point can be undone by hydration. Hydration
  // attaches JS properties without a DOM mutation, so explicitly retry it.
  clearTimeout(hydrationRetry)
  const applicationContainerElement = document.querySelector('.application--container')
  if (applicationContainerElement) {
    // The phone widget adds a non-React country-search input inside the wrapper.
    // Only the application's labeled control participates in hydration readiness.
    await Section.autoDiscover(node)
    await Promise.allSettled(inputs.map((i) => i.autoDiscover(node)))
    const pending = Array.from(applicationContainerElement.querySelectorAll<HTMLElement>('.text-input-wrapper, .select'))
      .filter(element => !element.hasAttribute('job-app-filler') && !element.closest('[data-jaf-ui]'))
    if (pending.length && retryCount++ < 50) {
      hydrationRetry = setTimeout(() => { RegisterInputs(document).catch(console.error) }, 200)
    } else {
      retryCount = 0
      for (const element of pending) {
        const label = element.querySelector('label')?.textContent?.trim()
        if (!label || !isRequiredField(element, label)) continue
        await contentScriptAPI.send('reportFieldResult', { fieldName: label,
          section: element.closest('[jaf-section]')?.getAttribute('jaf-section') || '',
          required: true, stage: 'discovery' }).catch(() => {})
      }
    }
  }
}
