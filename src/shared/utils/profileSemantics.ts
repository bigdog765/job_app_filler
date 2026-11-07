// Deliberately bounded local inference: only known meanings, never guessed facts.
export const semanticText = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/\(\s*(required|optional)\s*\)/g, '')
  .replace(/[\s*:✱✲✳∗⁎?.]+/g, ' ').trim()

export function sectionMeaning(value: string): string {
  const text = semanticText(value)
  const work = text.match(/^(?:work experience|professional experience|employment history|employment|work history|experience)(?:\s*#?\s*(\d+))?$/)
  if (work) return `Work Experience${work[1] ? ` ${work[1]}` : ''}`
  const education = text.match(/^(?:education|education history|academic history)(?:\s*#?\s*(\d+))?$/)
  if (education) return `Education${education[1] ? ` ${education[1]}` : ''}`
  return value
}

export function fieldMeaning(value: string, section = ''): string {
  // Strip question phrasing, not arbitrary words: "desired job title" and
  // "supervisor job title" must stay distinct from the applicant's job title.
  const text = semanticText(value)
    .replace(/^(?:please (?:enter|provide|specify) (?:your |the )?|what (?:is|was) (?:your |the )?|your )/, '')
    .replace(/\s*\/\s*/g, '/')
  const common: Record<string, string[]> = {
    'First Name': ['first name', 'given name', 'forename', 'legal first name'],
    'Last Name': ['last name', 'family name', 'surname', 'legal last name'],
    'Full Name': ['full name', 'legal name', 'legal full name'],
    Email: ['email', 'email address', 'e-mail', 'e-mail address'],
    Phone: ['phone', 'phone number', 'telephone', 'telephone number', 'mobile number'],
  }
  const work: Record<string, string[]> = {
    Company: ['company', 'company name', 'employer', 'employer name', 'name of employer', 'name of the employer', 'name of the company', 'organization', 'organisation', 'company/employer', 'employer/company name'],
    'Job Title': ['job title', 'title', 'position', 'position title', 'role', 'role title', 'job position', 'job title/position', 'position/job title', 'title of your position', 'title of the position', 'job title at this company'],
    'Role Description': ['role description', 'description', 'job description', 'responsibilities', 'key responsibilities', 'duties', 'duties and responsibilities', 'describe your responsibilities', 'describe your duties'],
    'I currently work here': ['i currently work here', 'currently employed', 'current position', 'present', 'is this your current job', 'current job'],
  }
  const dates: Record<string, string[]> = {
    From: ['from', 'start date', 'employment start date', 'date started', 'employment from', 'attendance start date'],
    To: ['to', 'end date', 'employment end date', 'date ended', 'employment to', 'graduation date', 'date graduated'],
  }
  const education: Record<string, string[]> = {
    School: ['school', 'school name', 'school or university', 'university', 'institution', 'institution name'],
    'Field of Study': ['field of study', 'major', 'discipline', 'area of study'],
  }
  const scope = sectionMeaning(section)
  const meanings = { ...common, ...(/^Work Experience/.test(scope) ? { ...work, ...dates } : {}),
    ...(/^Education/.test(scope) ? { ...education, ...dates } : {}) }
  return Object.keys(meanings).find((key) => meanings[key].includes(text)) || value
}
