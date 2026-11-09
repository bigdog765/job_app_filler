/** Find the application control, excluding inputs added by nested widgets. */
export function getTextControl(container: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null {
  const control = container.querySelector<HTMLLabelElement>('label[for]')?.control
  if (control && container.contains(control) && control.matches('input, textarea')) {
    return control as HTMLInputElement | HTMLTextAreaElement
  }
  return container.querySelector(
    'input:not([type="hidden"]):not([type="search"]):not([role="combobox"]), textarea')
}
