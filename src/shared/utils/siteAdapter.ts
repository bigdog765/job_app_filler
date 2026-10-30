export type SiteAdapter = 'workday' | 'greenhouse' | 'greenhouseReact' | 'generic'

export function getSiteAdapter(hostname: string): SiteAdapter {
  const host = hostname.toLowerCase()
  const matches = (domain: string) => host === domain || host.endsWith('.' + domain)
  if (matches('myworkdayjobs.com') || matches('myworkdaysite.com')) return 'workday'
  if (matches('job-boards.greenhouse.io')) return 'greenhouseReact'
  if (matches('boards.greenhouse.io') || matches('boards.eu.greenhouse.io')) return 'greenhouse'
  return 'generic'
}
