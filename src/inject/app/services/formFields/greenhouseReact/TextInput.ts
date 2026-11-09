import { getElement } from "@src/shared/utils/getElements";
import { GreenhouseReactBaseInput } from "./GreenhouseReactBaseInput";
import { xpaths } from "./xpaths";
import { getReactProps } from "../utils";
import { sleep } from '@src/shared/utils/async'
import { getTextControl } from './textControl'



export class TextInput extends GreenhouseReactBaseInput<any> {
  static XPATH = xpaths.TEXT_INPUT
  fieldType = 'TextInput'
  private edited = false
  private filling = false
  private automaticFill: Promise<void>
  
  get labelElement(): HTMLElement {
    return getElement(this.element, `.//label`)
  }

  get inputElement(): HTMLInputElement {
    return getTextControl(this.element) as HTMLInputElement
  }

  listenForChanges(): void {
    const input = this.inputElement
    input.addEventListener("input", (event) => {
      // Page initialization can emit synthetic events; only protect actual
      // typing (including a focused input used by accessibility/input tools).
      if (!this.filling && (event.isTrusted || input.ownerDocument.activeElement === input)) this.edited = true
      this.triggerReactUpdate()
    })
  }

  currentValue() {
    return this.inputElement.value
  }
  autoFill(): Promise<void> {
    if (this.automaticFill) return this.automaticFill
    this.automaticFill = (async () => {
      // A late React initialization/reset can clear an early successful fill.
      // Recheck briefly, without continually replacing edits or nonblank values.
      for (const delay of [0, 200, 500, 1000, 2000]) {
        if (delay) await sleep(delay)
        if (this.edited || !this.inputElement?.isConnected) return
        if (delay && this.currentValue()) continue
        const before = this.currentValue()
        const answers = await this.answer()
        if (!this.edited && this.currentValue() === before) this.fillAnswer(answers[0]?.answer)
      }
    })()
    return this.automaticFill
  }

  private fillAnswer(value: unknown) {
    const input = this.inputElement
    const props = getReactProps(input)
    const eventName = typeof props?.onChange === 'function' ? 'onChange' : 'onInput'
    if (typeof value !== 'string' || !value.trim() || !input?.isConnected ||
        input.disabled || input.readOnly || typeof props?.[eventName] !== 'function') return
    // Keep React's state and the DOM in sync; both event targets are used by
    // Greenhouse controls. Never count a DOM-only assignment as a filled form.
    const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
    this.filling = true
    try {
      setter.call(input, value)
      if (eventName === 'onInput') {
        // The phone widget uses native input listeners before React's onInput
        // reads its formatted number. Let the event reach both in normal order.
        input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }))
      } else {
        props.onChange({ target: input, currentTarget: input, type: 'change',
          preventDefault() {}, stopPropagation() {} })
      }
    } finally {
      this.filling = false
    }
    this.triggerReactUpdate()
  }
  async fill(): Promise<void> {
      const answers = await this.answer()
      this.fillAnswer(answers[0]?.answer)
  }
}
