# Local profile

Copy `profile.example.json` to `profile.local.json` and enter your answers. Keep
IDs unique and stable when editing or reordering entries. Personal profiles are
git-ignored; the example must remain blank.

Each entry has `id`, `labels` (aliases), and `value`. Optional `sections` and
`fieldTypes` restrict use; `enabled: false` disables an entry. Empty strings,
nulls, and empty lists are skipped. Invalid schema or duplicate IDs disable the
whole profile and are reported in the extension popup on a supported page.
An empty string in `sections` explicitly matches fields without a section.
Unknown field type names may be retained in the profile but are never filled.
Malformed JSON and missing files also disable profile lookup without falling
back to Chrome-saved answers. Diagnostics never include personal values.

Supported values:

| Field type | Value |
| --- | --- |
| `TextInput`, `BooleanRadio` | String (including phone/ZIP codes and Yes/No radio labels) |
| `SimpleDropdown`, `MultiCheckbox` | String or list of option labels |
| `SingleCheckbox` | Boolean |
| `Year` | Four-digit year string |
| `MonthYear` | Month/year strings, e.g. `["08", "2024"]`; requires explicit `fieldTypes: ["MonthYear"]` |

Lookup uses normalized whole labels first, then a small conservative synonym
dictionary (e.g. Employer / Company Name). Multiple compatible matches produce
no answer. Add explicit aliases for unsupported wording. Sections accept
Employment History / Work History as aliases of Work Experience. Record numbers
must match exactly: Work Experience 1 cannot answer Work Experience 2. Work and
education fields require explicit section scopes; an unnumbered section never
borrows from a numbered one. Unknown/custom sections match literally.

AI is not connected yet. Passwords, files, full dates, and consent/signature
questions are excluded. Existing site adapters still control filling and option
selection; this change does not add generic-form support or new filling behavior.
The legacy editor remains visible until the UI migration, but cannot save or
delete answers. Old Chrome-saved data remains untouched and is not searched.

Run `npm start` for watch builds or `npx webpack --config webpack.prod.js` for a
single production build, then reload the unpacked extension and refresh the
application page. The file is read at build time; watch mode tracks edits and
creation/removal. The popup reports the profile loaded by the current page.
Built bundles contain personal values: do not share a personal build or release
ZIP. Use a checkout without `profile.local.json` for public builds.

Checks: `npm test`, `npx tsc --noEmit`, and a one-time production build.
