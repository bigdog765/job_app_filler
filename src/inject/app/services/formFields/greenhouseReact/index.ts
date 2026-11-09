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
import { getReactProps } from '../utils'
import { getTextControl } from './textControl'

let hydrationRetry: ReturnType<typeof setTimeout>

const inputs = [
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
    const textControls = Array.from(applicationContainerElement.querySelectorAll<HTMLElement>(
      '.text-input-wrapper')).map(getTextControl).filter(Boolean)
    if (textControls.some((control) => !getReactProps(control))) {
      hydrationRetry = setTimeout(() => { RegisterInputs(document).catch(console.error) }, 200)
      return
    }
    await Section.autoDiscover(node)
    await Promise.all(inputs.map((i) => i.autoDiscover(node)))
  }
}
