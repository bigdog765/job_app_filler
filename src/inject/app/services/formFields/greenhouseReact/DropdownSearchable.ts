import { AnswerValueBackupStrings } from '../../../MoreInfoPopup/AnswerDisplay/AnswerValueDisplay/AnswerValueBackupStrings'
import fieldFillerQueue from '@src/shared/utils/fieldFillerQueue'
import { GreenhouseReactBaseInput } from './GreenhouseReactBaseInput'
import { xpaths } from './xpaths'
import { answerValueInitList } from '../../../hooks/answerValueInit'
import { selectedText, selectAnswer } from './selectControl'
import { sleep } from '@src/shared/utils/async'

export class DropdownSearchable extends GreenhouseReactBaseInput<any> {
  static XPATH = xpaths.DROPDOWN_SEARCHABLE
  fieldType = 'SimpleDropdown'
  private edited = false
  private automaticFill: Promise<void>
  public get answerValue() {
    return {
      ...super.answerValue,
      displayComponent: AnswerValueBackupStrings,
      init: answerValueInitList,
      prepForSave: (values: [string, boolean][]) => values.map(([value]) => value),
      prepForFill: (answers) => super.answerValue.prepForFill(answers).flat(),
    }
  }
  get labelElement(): HTMLElement { return this.element.querySelector('label') }
  get fieldSnapshot() { return { path: this.path, answer: [this.currentValue()] } }
  currentValue() { return selectedText(this.element) }
  isFilled(current: any, stored: any[]) { return stored.includes(current) }

  listenForChanges() {
    for (const type of ['input', 'pointerdown', 'keydown']) {
      this.element.addEventListener(type, event => {
        if (event.isTrusted) this.edited = true
      })
    }
    const observer = new MutationObserver(() => {
      this.triggerReactUpdate()
      if (this.edited && this.currentValue()) void this.reportResult(null)
    })
    observer.observe(this.element.querySelector('.select__control') || this.element,
      { childList: true, subtree: true, characterData: true })
  }

  autoFill(): Promise<void> {
    if (!this.automaticFill) this.automaticFill = this.fillAutomatically()
    return this.automaticFill
  }
  private async fillAutomatically() {
    for (const delay of [0, 1000, 3000]) {
      if (delay) await sleep(delay)
      if (this.edited || !this.element.isConnected) return
      if (delay && this.currentValue()) { await this.reportResult(null); return }
      await this.applyAnswer(true)
    }
  }
  private async applyAnswer(automatic: boolean) {
    const before = this.currentValue()
    const cancelled = () => !this.element.isConnected || (automatic && this.edited)
    let answers: string[] = []
    try {
      answers = (await this.answer()).flatMap(answer => answer.answer)
        .filter(value => typeof value === 'string' && value.trim())
      if (cancelled() || (automatic && this.currentValue() !== before)) return
      if (!answers.length) {
        await this.reportResult(this.currentValue() ? null : 'matching')
        return
      }
      await fieldFillerQueue.enqueue(async () => {
        if (cancelled() || (automatic && this.currentValue() !== before)) return
        const success = await selectAnswer(this.element, answers, this.fieldName, cancelled)
        if (!cancelled()) await this.reportResult(success || this.currentValue() ? null : 'selection')
      })
    } catch {
      if (!cancelled()) await this.reportResult(this.currentValue() ? null : answers.length ? 'selection' : 'matching')
    }
  }
  async fill() { await this.applyAnswer(false) }
}
