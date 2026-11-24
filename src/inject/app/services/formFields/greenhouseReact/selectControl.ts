import { getReactProps } from '../utils'
import { matchingOption } from './optionMatching'
import { sleep } from '@src/shared/utils/async'

export function selectedText(element: HTMLElement): string {
  return Array.from(element.querySelectorAll<HTMLElement>('.select__single-value, .select__multi-value__label'))
    .map(node => node.textContent?.trim()).filter(Boolean).join(', ')
}

/** One dropdown at a time, with its original selection intact until a match is ready. */
export async function selectAnswer(element: HTMLElement, answers: string[], label: string,
  cancelled: () => boolean = () => false): Promise<boolean> {
  const input = element.querySelector<HTMLInputElement>('input[role="combobox"], input.select__input')
  if (!input || input.disabled || !answers.length) return false
  const selected = () => Array.from(element.querySelectorAll<HTMLElement>('.select__single-value, .select__multi-value__label'))
  const matchesCurrent = () => !!matchingOption(selected(), answers, label)
  if (matchesCurrent()) return true
  const available = () => {
    const ids = [input.getAttribute('aria-controls'), input.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/)
    const roots = [element, ...ids.map(id => element.ownerDocument.getElementById(id)).filter(Boolean)]
    return [...new Set(roots.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('[role="option"], .select__option'))))]
      .filter(option => !option.closest('[aria-disabled="true"], [hidden], [aria-hidden="true"]') &&
        !option.classList.contains('select__option--is-disabled') && option.getClientRects().length > 0)
  }
  const event = (type: string) => ({ target: input, currentTarget: input, type,
    defaultPrevented: false, preventDefault() {}, stopPropagation() {} })
  const search = (value: string) => {
    const props = getReactProps(input)
    if (input.readOnly || typeof props?.onChange !== 'function') return false
    Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set.call(input, value)
    props.onChange(event('change'))
    return true
  }
  const waitForMatch = async (duration: number) => {
    for (let elapsed = 0; elapsed < duration; elapsed += 100) {
      if (cancelled() || !input.isConnected) return
      const match = matchingOption(available(), answers, label)
      if (match) return match
      await sleep(100)
    }
  }
  try {
    if (input.getAttribute('aria-expanded') !== 'true') {
      const trigger = Array.from(element.querySelectorAll<HTMLElement>('.select-shell > div'))
        .find(node => typeof getReactProps(node)?.onMouseUp === 'function')
      if (trigger) getReactProps(trigger).onMouseUp(event('mouseup'))
      else {
        const control = element.querySelector<HTMLElement>('.select__control')
        const props = getReactProps(control)
        if (typeof props?.onMouseDown === 'function') props.onMouseDown({ ...event('mousedown'), button: 0 })
        else element.querySelector<HTMLButtonElement>('button[aria-label="Toggle flyout"]')?.click()
      }
    }
    let match = await waitForMatch(800)
    if (!match) {
      for (const value of answers) {
        if (cancelled() || !input.isConnected) return false
        if (!search(value)) break
        await sleep(300)
        match = await waitForMatch(2500)
        if (match) break
      }
    }
    if (!match || cancelled() || !match.isConnected) return false
    match.click()
    for (let elapsed = 0; elapsed < 2000; elapsed += 100) {
      await sleep(100)
      if (cancelled() || !input.isConnected) return false
      if (matchesCurrent()) return true
    }
    return false
  } finally {
    if (!cancelled() && input.isConnected) {
      search('')
      const props = getReactProps(input)
      if (typeof props?.onBlur === 'function') props.onBlur({ ...event('blur'), relatedTarget: null })
      await sleep(0)
    }
  }
}
