const headingSelector = 'h1, h2, h3, h4, h5, h6, [role="heading"], legend'
const repeatedSection = /^(?:work experience|work history|employment|experience|education)\s+\d+$/i
const DOCUMENT_POSITION_FOLLOWING = 4

/** Find the nearest preceding section heading, regardless of Workday's heading level.
 * Walk outward so a later role never inherits the first role's heading.
 */
export function findRepeatedSectionHeading(element: HTMLElement): HTMLElement | null {
  for (let container = element.parentElement;
       container && container !== element.ownerDocument.body;
       container = container.parentElement) {
    const headings = Array.from(container.querySelectorAll<HTMLElement>(headingSelector))
      .filter((heading) =>
        !heading.closest('[job-app-filler], [hidden], [aria-hidden="true"]') &&
        !heading.contains(element) &&
        Boolean(heading.compareDocumentPosition(element) & DOCUMENT_POSITION_FOLLOWING)
      )
    const nearest = headings[headings.length - 1]
    if (nearest) {
      const label = (nearest.textContent || '').replace(/\s+/g, ' ').trim()
      // An intervening heading marks a new section; do not borrow an earlier role.
      return repeatedSection.test(label) ? nearest : null
    }
  }
  return null
}
