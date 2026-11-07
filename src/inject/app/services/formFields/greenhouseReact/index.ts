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
    const textControls = Array.from(applicationContainerElement.querySelectorAll<HTMLElement>(
      '.text-input-wrapper input, .text-input-wrapper textarea'))
    if (textControls.some((control) => !getReactProps(control))) {
      hydrationRetry = setTimeout(() => { RegisterInputs(document).catch(console.error) }, 200)
      return
    }
    await Section.autoDiscover(node)
    await Promise.all(inputs.map((i) => i.autoDiscover(node)))
  }
}
