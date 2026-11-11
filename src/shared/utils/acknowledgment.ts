export function isAcknowledgment(label: string): boolean {
  const text = label.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
  // Only acknowledgments of reading/receipt, not unrelated choices or factual certifications.
  if (/\b(do not|don't|decline|opt out|marketing|newsletter|subscribe|subscription|job alerts|talent community|background check|drug test|certify|attest|authorized to work|eligible|over 18|accurate|truthful)\b/.test(text)) return false
  return /\backnowledg(?:e|ed|ement|ment)\b/.test(text) ||
    /\bi (?:have )?(?:read|reviewed)\b.*\b(?:understand|understood|agree)\b/.test(text)
}

