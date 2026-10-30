import { RegisterInputs as workday } from './app/services/formFields/workday'
import { RegisterInputs as greenhouse } from './app/services/formFields/greenhouse'
import { RegisterInputs as greenhouseReact } from './app/services/formFields/greenhouseReact'
import { getSiteAdapter } from '@src/shared/utils/siteAdapter'

type InputSetup = (node: Node) => Promise<void>
const inputRegistrars: Record<string, InputSetup> = { workday, greenhouse, greenhouseReact }

const run = async () => {
  const RegisterInputs = inputRegistrars[getSiteAdapter(window.location.hostname)]
  if (!RegisterInputs) return
  const observer = new MutationObserver(async (_) => {
    RegisterInputs(document)
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
  RegisterInputs(document)
}

/**
 * Prevent the injected script from running until the tab is revealed.
 * For example, when you open multiple tabs at once.
 */
if (!document.hidden) {
  run()
} else {
  const f = () => {
    run()
    document.removeEventListener('visibilitychange', f)
  }
  document.addEventListener('visibilitychange', f)
}
