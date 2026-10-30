import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { BaseFormInput, AnswerValueMethods } from '../baseFormInput'
import { AnswerValueBackupStrings } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueBackupStrings'
import { AnswerValueSingleBool } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleBool'
import { AnswerValueSingleDate } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleDate'
import { answerValueInitList } from '../../../hooks/answerValueInit'
import {
  Control, controlType, currentValue, fieldLabel, fieldSection, fillControl,
  isEmpty, isUsable, radioControls,
} from './dom'

export class GenericInput extends BaseFormInput<any> {
  fieldType = controlType(this.control)
  private root: Root
  private widget: HTMLElement
  private touched = false
  private listeners: Array<() => void>

  get control(): Control { return this.element as Control }
  get fieldName(): string { return fieldLabel(this.control) }
  get section(): string { return fieldSection(this.control) }
  get page(): string { return this.element.ownerDocument.title }

  get answerValue(): AnswerValueMethods {
    if (['SimpleDropdown', 'MultiSelect'].includes(this.fieldType)) {
      return {
        ...super.answerValue,
        displayComponent: AnswerValueBackupStrings,
        init: answerValueInitList,
        prepForSave: (values: [string, boolean][]) => values.map(([value]) => value),
        prepForFill: (answers) => answers.flatMap((answer) => answer.originalAnswer.answer),
      }
    }
    return {
      ...super.answerValue,
      ...(this.fieldType === 'SingleCheckbox' && { displayComponent: AnswerValueSingleBool }),
      ...(this.fieldType === 'MonthYear' && { displayComponent: AnswerValueSingleDate }),
    }
  }

  attachReactApp(app: React.ReactNode) {
    // Do not move the site's input or place extension buttons inside its label.
    const anchor = this.control.closest('label') || this.control
    this.widget = this.element.ownerDocument.createElement('div')
    this.widget.className = 'jaf-widget'
    this.widget.setAttribute('data-jaf-ui', '')
    anchor.insertAdjacentElement('afterend', this.widget)
    this.root = createRoot(this.widget)
    this.root.render(app)
  }

  listenForChanges() {
    // Called by BaseFormInput before subclass field initializers run.
    const controls = this.control.type === 'radio'
      ? radioControls(this.control as HTMLInputElement) : [this.control]
    this.listeners = controls.map((control) => {
      const onChange = () => { this.touched = true; this.triggerReactUpdate() }
      control.addEventListener('input', onChange)
      control.addEventListener('change', onChange)
      return () => {
        control.removeEventListener('input', onChange)
        control.removeEventListener('change', onChange)
      }
    })
  }

  currentValue() { return currentValue(this.control) }

  get fieldSnapshot() {
    const value = this.currentValue()
    return { path: this.path, answer: this.fieldType === 'SimpleDropdown' ? [value] : value }
  }

  isFilled(current: any, stored: any[]): boolean {
    if (this.fieldType === 'MultiSelect') {
      return current.length > 0 && current.length === stored.length && current.every((value) => stored.includes(value))
    }
    return stored.some((value) => JSON.stringify(current) === JSON.stringify(value))
  }

  async autoFill(): Promise<void> {
    if (this.touched || !isUsable(this.control) || !isEmpty(this.control)) return
    const answers = await this.answer()
    // The user may have typed while Chrome storage was being read.
    if (!this.touched && isEmpty(this.control)) fillControl(this.control, answers.map((answer) => answer.answer))
  }

  async fill(): Promise<void> {
    const answers = await this.answer()
    fillControl(this.control, answers.map((answer) => answer.answer))
  }

  dispose() {
    this.listeners.forEach((remove) => remove())
    this.root.unmount()
    this.widget.remove()
    this.element.removeAttribute('job-app-filler')
  }
}
