type FieldResult = {
  fieldName: string
  section: string
  required: boolean
  stage: 'discovery' | 'matching' | 'selection' | null
}

// Kept in the content script so another tab's form cannot overwrite these results.
const results = new Map<string, FieldResult>()
export function reportFieldResult(result: FieldResult) {
  if (!result || typeof result.fieldName !== 'string' || !result.fieldName.trim() ||
      result.fieldName.length > 2000 || typeof result.section !== 'string' || result.section.length > 500 ||
      !['discovery', 'matching', 'selection', null].includes(result.stage)) return
  result = { ...result, fieldName: result.fieldName.replace(/\s+/g, ' ').trim(),
    section: result.section.replace(/\s+/g, ' ').trim() }
  const key = JSON.stringify([result.fieldName, result.section])
  if (result.required !== true || result.stage === null) results.delete(key)
  else if (results.size < 200 || results.has(key)) results.set(key, result)
}
export const getFieldDiagnostics = () => [...results.values()]
