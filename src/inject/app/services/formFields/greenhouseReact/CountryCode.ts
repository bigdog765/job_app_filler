import { GreenhouseReactBaseInput } from './GreenhouseReactBaseInput'
import fieldFillerQueue from '@src/shared/utils/fieldFillerQueue'
import { contentScriptAPI } from '../../contentScriptApi'
import { sleep } from '@src/shared/utils/async'
import { optionKey } from './optionMatching'

/** Country picker installed inside the telephone control by intl-tel-input. */
export class CountryCode extends GreenhouseReactBaseInput<string> {
  static XPATH = './/div[contains(concat(" ", normalize-space(@class), " "), " iti__country-container ")]'
  fieldType = 'TextInput'
  private edited = false
  get fieldName() { return 'Country Code' }
  get labelElement(): HTMLElement { return this.element.closest('.text-input-wrapper')?.querySelector('label') }
  get button(): HTMLElement {
    return this.element.querySelector('.iti__selected-country, .iti__selected-flag')
  }
  currentValue() {
    return this.button?.querySelector('.iti__selected-dial-code')?.textContent?.trim() ||
      this.button?.getAttribute('title')?.match(/\+\d+/)?.[0] || ''
  }
  listenForChanges() {
    this.element.addEventListener('pointerdown', event => { if (event.isTrusted) this.edited = true })
    this.element.addEventListener('keydown', event => { if (event.isTrusted) this.edited = true })
  }
  async fill() {
    const answers = (await this.answer()).flatMap(answer => answer.answer).filter(value => typeof value === 'string')
    if (!answers.length || this.edited) return
    const country = await contentScriptAPI.send('getAnswer', { ...this.path, fieldName: 'Country', required: false })
    const countryNames = (country.data || []).flatMap(answer => answer.answer)
      .filter(value => typeof value === 'string').map(value => optionKey(value, 'Country'))
    await fieldFillerQueue.enqueue(async () => {
      if (this.edited || !this.element.isConnected || answers.includes(this.currentValue())) return
      this.button?.click()
      for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
        if (this.edited || !this.element.isConnected) return
        const options = Array.from(this.element.querySelectorAll<HTMLElement>('.iti__country[data-dial-code]'))
          .filter(option => answers.includes('+' + option.dataset.dialCode) && option.getClientRects().length > 0)
        const narrowed = options.length === 1 ? options : options.filter(option =>
          countryNames.includes(optionKey(option.querySelector('.iti__country-name')?.textContent || '', 'Country')))
        if (narrowed.length === 1) { narrowed[0].click(); await sleep(100); return }
        await sleep(100)
      }
      if (this.button?.getAttribute('aria-expanded') === 'true') this.button.click()
    })
  }
}
