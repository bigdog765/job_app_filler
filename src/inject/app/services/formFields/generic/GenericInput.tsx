import React from 'react'
import type { Root } from 'react-dom/client'
import { createFieldIndicatorRoot } from '../../../FieldWidget/fieldIndicatorRoot'
import { BaseFormInput, AnswerValueMethods } from '../baseFormInput'
import { AnswerValueBackupStrings } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueBackupStrings'
import { AnswerValueSingleBool } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleBool'
import { AnswerValueSingleDate } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueSingleDate'
import { answerValueInitList } from '../../../hooks/answerValueInit'
import {
  Control, controlType, currentValue, fieldLabel, fieldSection, fillControl,
  isUsable, radioControls,
} from './dom'

export class GenericInput extends BaseFormInput<any> {
  fieldType = controlType(this.control)
  private root: Root
  private widget: HTMLElement
  private touched = false
  private fillingAutomatically = false
  preventAutoFill?: () => boolean
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
    const { host, root } = createFieldIndicatorRoot(this.element.ownerDocument)
    this.widget = host
    anchor.insertAdjacentElement('afterend', this.widget)
    this.root = root
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
    if (this.fillingAutomatically || this.touched || this.preventAutoFill?.() || !isUsable(this.control)) return
    this.fillingAutomatically = true
    const before = JSON.stringify(this.fieldSnapshot)
    try {
      // Use the same saved/profile answer lookup as the wand, including when
      // the website has already populated an old value or a default option.
      const answers = await this.answer()
      if (!this.touched && !this.preventAutoFill?.() && before === JSON.stringify(this.fieldSnapshot)) {
        fillControl(this.control, answers.map((answer) => answer.answer))
      }
    } finally { this.fillingAutomatically = false }
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
