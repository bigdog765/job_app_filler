# Local master profile

Edit `profile.local.json` in the repository root with your own values. This file
is ignored by Git. A blank starter has been created locally; on a new checkout,
copy `profile.example.json` to `profile.local.json`. Keep personal information out
of the tracked example file.

Each entry provides one value and the field labels that should use it:

```json
{
  "entries": [
    {
      "labels": ["First Name", "Given Name", "Legal First Name"],
      "value": "Your first name"
    },
    {
      "labels": ["Country", "Country/Region"],
      "value": ["United States of America", "United States", "USA"],
      "fieldTypes": ["SimpleDropdown"]
    }
  ]
}
```

Replace example values with your own. Empty strings, nulls, empty lists and
disabled entries (`"enabled": false`) are ignored. The first compatible,
populated entry wins. Labels match whole names, ignoring case, extra whitespace,
asterisks (including Unicode markers such as Lever's `✱`), colons, and
`(required)` / `(optional)` markers. Add aliases for other
wording; the profile does not guess answers from similar questions.

Optional `sections` and `fieldTypes` arrays restrict an entry. For repeated
education or employment fields, use numbered sections such as `Work Experience 1`
and `Education 1`. Put specific entries before general ones.
Without these restrictions, an entry applies to matching labels across sections
and supported sites.

Supported values:

| Field type | JSON value |
| --- | --- |
| `TextInput` (also textareas and number inputs) | A nonempty string; use strings for phone numbers and ZIP codes |
| `SimpleDropdown`, `MultiCheckbox` | A string or list of option labels; selection behavior follows the site's existing adapter |
| `MultiSelect` (native company-form multiselect) | A list of selected option labels |
| `BooleanRadio` | An option label such as `"Yes"` or `"No"` |
| `SingleCheckbox` | `true` or `false` |
| `Year` | A four-digit year string such as `"2023"` |
| `MonthYear` | A month/year pair such as `["08", "2023"]` |

Full dates requiring a day continue to use Chrome-saved answers. Generic native
date fields use existing `DateInput` answers with a `YYYY-MM-DD` string.
The profile does not supply full dates, passwords, or files. Generic forms skip
password and upload fields entirely.
Use `fieldTypes` to restrict month/year pairs to `MonthYear`, so they are not
interpreted as dropdown alternatives. Scope employment and education dates to
their numbered sections; do not invent a day when only the month is known.

## Using changes

Parsed fields display a small teal check icon. It acknowledges field detection,
not successful filling. The old per-field logo, wand, save button, and answer
popup are no longer displayed. Autofill runs automatically; use the extension
popup's **Review profile updates** for supported generic forms. Edit the local
profile to maintain your fallback answers.

Run `npm start`, then load/reload `dist/` at `chrome://extensions/` and refresh the
application page. Changes to an existing profile trigger a rebuild in watch mode.
Restart Webpack after creating or removing the local file. For a single production
build, use `npx webpack --config webpack.prod.js`.

Per-field saved-answer lookup uses Chrome's existing answer search first
(including similar-name matches), with the profile as a fallback. Generic company
forms additionally run profile inference first, as described below.
Profile values use automatic filling on
supported Workday, Greenhouse, and ordinary company application forms. Generic
forms are detected automatically or enabled from the extension popup. Generic
inference replaces prefilled values when the local profile matches, preserves
edits made after the extension starts, and excludes consent fields. A
company form's unnumbered sections use an empty section; numbered work/education
headings keep their section names so repeated entries remain separate.

Fallbacks are not automatically copied into Chrome storage. To change or remove
a fallback, edit, clear or disable its local entry and rebuild. Previously saved
Chrome answers remain available to automatic filling.

The local profile is compiled into `dist/contentScript.js`, so local builds and
release ZIPs contain your configured values even though the JSON is git-ignored.
Before distributing a build, remove the local profile from the checkout and
restart/rebuild with the blank example. A checkout without the local file works
normally with Chrome storage alone.

Run `npm test` for fallback matching and Chrome-override regression checks.

On React-based Greenhouse pages (`job-boards.greenhouse.io`), automatic text
filling waits for the website's form handlers to attach. It briefly rechecks blank
fields during initialization, so a late page reset does not require a wand click.
Typing into a field stops these automatic retries for that field.

## Reviewing outdated website answers

On detected standard company forms, inferred matches from `profile.local.json`
fill automatically, including replacing outdated prefilled values. New visible
fields are checked as the form changes. Your subsequent edits are preserved.
Use **Enable on this page** if a form is not detected. **Review profile updates**
also enables automatic inference and shows remaining differences; select updates
there to deliberately replace your own edits. Inference uses the local profile
directly, even when Chrome contains older saved answers. It does not change saved
Chrome answers or submit the form.

Review uses local rules to infer field meanings from labels, section headings,
and repeated record containers. For example, “Name of employer” and “Role title”
under “Employment history” map to company and job title. Unnumbered employment
and education records are numbered by their order on the page. Job-title fields
can identify work records when employer controls are absent or unsupported;
common questions such as “What was your job title?” resolve to the same meaning.
The review explains when it inferred a record number. Check that each
record lines up with your profile (newest first); this is not employer identity
matching. Ambiguous fields remain unmatched. Fields without an inferred profile
value automatically use Chrome-first answer lookup, even
when a website has prefilled the field. Later edits are preserved. The extension
retries untouched fields as dynamic controls or dropdown options appear.

No external AI service is used. Review currently covers native controls on
generic company forms in the main page. Dedicated Workday/Greenhouse adapters,
embedded frames, custom dropdowns, hidden/collapsed sections, file uploads and
passwords are outside this review flow. Expand existing work-history records
before reviewing. Add missing records with the website's controls, then review
again; review does not add or delete employment rows. Fields edited or reordered
after a scan are skipped; run another review to use their new state.
