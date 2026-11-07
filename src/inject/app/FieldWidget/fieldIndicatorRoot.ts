import { createRoot } from 'react-dom/client'

/** Keep both the icon and its host independent of the job site's CSS. */
export function createFieldIndicatorRoot(document: Document) {
  const host = document.createElement('span')
  host.className = 'jaf-widget'
  host.setAttribute('data-jaf-ui', '')
  const css = `
    all: initial !important;
    display: inline-block !important;
    box-sizing: border-box !important;
    width: 16px !important;
    height: 16px !important;
    min-width: 16px !important;
    max-width: 16px !important;
    min-height: 16px !important;
    max-height: 16px !important;
    margin: 0 4px !important;
    padding: 0 !important;
    border: 0 !important;
    vertical-align: middle !important;
    line-height: 0 !important;
    flex: 0 0 16px !important;
    overflow: hidden !important;
  `
  host.style.cssText = css
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  // Important shadow-host rules also resist a site's !important declarations.
  style.textContent = `:host { ${css} } :host::before, :host::after { content: none !important; }
    svg { display: block; width: 16px; height: 16px; }`
  const mount = document.createElement('span')
  shadow.append(style, mount)
  return { host, root: createRoot(mount) }
}
