import React, { useEffect } from 'react'
import type { BaseFormInput } from './services/formFields/baseFormInput'
import { createFieldIndicatorRoot } from './FieldWidget/fieldIndicatorRoot'

export const App: React.FC<{
  backend: BaseFormInput<any>
}> = ({ backend }) => {
  useEffect(() => {
    // Autofill is independent of the old toolbar and answer-editor UI.
    backend.autoFill().catch(console.error)
  }, [backend])
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"
      role="img" aria-label="Parsed by Job App Filler" focusable="false">
      <circle cx="8" cy="8" r="7" fill="#00877d" />
      <path d="M4.5 8.1 6.8 10.4 11.5 5.7" fill="none" stroke="#fff"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const attachReactApp = (
  app: React.ReactNode,
  inputContainer: HTMLElement
) => {
  // cant just append the react app to the root element...
  // it makes the element disappear
  const { host, root } = createFieldIndicatorRoot(inputContainer.ownerDocument)
  inputContainer.insertBefore(host, inputContainer.lastChild)
  root.render(app)
}
