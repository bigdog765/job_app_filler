import { createFieldIndicatorRoot } from '../../../FieldWidget/fieldIndicatorRoot'
import { BaseFormInput } from '../baseFormInput'
import { getElement } from '@src/shared/utils/getElements'

export abstract class GreenhouseReactBaseInput<
  AnswerType
> extends BaseFormInput<AnswerType> {
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
