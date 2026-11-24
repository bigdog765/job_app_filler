const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/[’']/g, '').replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
const states = 'AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming'
const stateNames = new Map(states.split('|').flatMap(pair => {
  const [code, name] = pair.split(':').map(normalize)
  return [[code, name], [name, name]]
}))
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function country(value: string) {
  if (/^\+?\d+$/.test(value)) return '+' + value.replace(/^\+/, '')
  const text = value.replace(/\s*\(?\+\d+\)?$/, '').trim()
  if (['us', 'usa', 'united states', 'united states of america'].includes(text)) return 'united states'
  if (['uk', 'gb', 'united kingdom', 'great britain'].includes(text)) return 'united kingdom'
  if (['ca', 'canada'].includes(text)) return 'canada'
  return text
}

export function optionKey(value: string, label: string): string {
  const text = normalize(value)
  if (/month/i.test(label)) {
    const month = months.findIndex(name => text === name || text === name.slice(0, 3))
    if (month >= 0) return String(month + 1)
    if (/^(0?[1-9]|1[012])$/.test(text)) return String(Number(text))
  }
  if (/state|province/i.test(label)) return stateNames.get(text) || text
  if (/country/i.test(label)) return country(text)
  if (/location|city/i.test(label)) {
    return text.split(',').map(part => {
      const trimmed = part.trim()
      return stateNames.get(trimmed) || country(trimmed)
    }).join(', ')
  }
  if (/degree/i.test(label)) {
    if (['bs', 'bsc', 'bachelor of science'].includes(text)) return 'bachelor of science'
    if (['ba', 'bachelor of arts'].includes(text)) return 'bachelor of arts'
    if (['bachelors', 'bachelors degree', 'bachelor'].includes(text)) return 'bachelors'
  }
  if (/pronoun/i.test(label)) return text.replace(/\s*\/\s*/g, '/')
  return text
}

export function matchingOption(options: HTMLElement[], answers: string[], label: string): HTMLElement | undefined {
  for (const answer of answers) {
    const key = optionKey(answer, label)
    if (!key) continue
    const exact = options.filter(option => optionKey(option.textContent || '', label) === key)
    if (exact.length === 1) return exact[0]
    if (/country.*code|dial.*code/i.test(label) && /^\+\d+$/.test(key)) {
      const matches = options.filter(option => (option.textContent || '').match(/\+\d+/)?.[0] === key)
      if (matches.length === 1) return matches[0]
    }
    // Require city and state and a unique result before accepting an appended country.
    if (/location|city/i.test(label) && key.split(',').length === 2 &&
        [...stateNames.values()].includes(key.split(',')[1].trim())) {
      const matches = options.filter(option => optionKey(option.textContent || '', label) === key + ', united states')
      if (matches.length === 1) return matches[0]
    }
  }
}
