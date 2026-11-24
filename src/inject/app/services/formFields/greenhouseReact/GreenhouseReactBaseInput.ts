import { createFieldIndicatorRoot } from '../../../FieldWidget/fieldIndicatorRoot'
import { BaseFormInput } from '../baseFormInput'
import { getElement, getElements } from '@src/shared/utils/getElements'
import { contentScriptAPI } from '../../contentScriptApi'
import { isRequiredField } from '@src/shared/utils/fieldRequirement'
import { getReactProps } from '../utils'
import { getTextControl } from './textControl'

export abstract class GreenhouseReactBaseInput<
  AnswerType
> extends BaseFormInput<AnswerType> {
  static async autoDiscover(node: Node = document) {
    for (const element of getElements(node, this.XPATH)) {
      if (element.hasAttribute('job-app-filler')) continue
      const control = element.matches('.iti__country-container') ? null :
        element.querySelector<HTMLElement>('input[role="combobox"]') || getTextControl(element)
      if (control && !getReactProps(control)) continue
      try {
        const backend = new (this as any)(element)
        void backend.reportResult(null)
      } catch {
        element.removeAttribute('job-app-filler')
      }
    }
  }
  async reportResult(stage: 'discovery' | 'matching' | 'selection' | null) {
    await contentScriptAPI.send('reportFieldResult', {
      fieldName: this.fieldName || 'Unnamed field', section: this.section,
      required: isRequiredField(this.element, this.fieldName), stage,
    }).catch(() => {})
  }
  get labelDisplayElement(): HTMLElement {
    return this.labelElement
  }
  abstract get labelElement(): HTMLElement

  sectionElement(): HTMLElement {
    return getElement(
      this.element,
      `ancestor::div[@jaf-section][1]`
    )
  }

  get section(): string {
    return this.sectionElement()?.getAttribute("jaf-section") || ""
  }
  attachReactApp(app: React.ReactNode, inputContainer: HTMLElement): void {
    const { host, root } = createFieldIndicatorRoot(inputContainer.ownerDocument)
    this.labelDisplayElement.insertAdjacentElement('afterend', host)
    root.render(app)
  }
}
