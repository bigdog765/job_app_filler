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
asterisks, colons, and `(required)` / `(optional)` markers. Add aliases for other
wording; the profile does not guess answers from similar questions.

Optional `sections` and `fieldTypes` arrays restrict an entry. For repeated
education or employment fields, use `sections` with the exact section names shown
in the extension's field information. Put specific entries before general ones.
Without these restrictions, an entry applies to matching labels across sections
and supported sites.

Supported values:

| Field type | JSON value |
| --- | --- |
| `TextInput` (also textareas and number inputs) | A nonempty string; use strings for phone numbers and ZIP codes |
| `SimpleDropdown`, `MultiCheckbox` | A string or list of option labels; selection behavior follows the site's existing adapter |
| `BooleanRadio` | An option label such as `"Yes"` or `"No"` |
| `SingleCheckbox` | `true` or `false` |

Dates, passwords, and file uploads continue to use Chrome-saved answers; the
profile does not currently supply these field types.

## Using changes

Run `npm start`, then load/reload `dist/` at `chrome://extensions/` and refresh the
application page. Changes to an existing profile trigger a rebuild in watch mode.
Restart Webpack after creating or removing the local file. For a single production
build, use `npx webpack --config webpack.prod.js`.

The extension uses Chrome's existing answer search first (including similar-name
matches). Only when that search returns no answers does it consult this profile.
Profile values use the existing automatic filling and manual Fill controls on
supported Workday and Greenhouse forms; this does not add support for arbitrary
websites.

Fallbacks are labeled **Local profile** in the answer UI and are not automatically
copied into Chrome storage. Editing and saving one creates a Chrome override.
To remove a fallback, clear or disable its local entry and rebuild. Removing a
Chrome override lets the profile apply again when the answers are next loaded.

The local profile is compiled into `dist/contentScript.js`, so local builds and
release ZIPs contain your configured values even though the JSON is git-ignored.
Before distributing a build, remove the local profile from the checkout and
restart/rebuild with the blank example. A checkout without the local file works
normally with Chrome storage alone.

Run `npm test` for fallback matching and Chrome-override regression checks.
