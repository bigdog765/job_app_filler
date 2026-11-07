# Repository summary

Job App Filler is a Chrome Manifest V3 extension forked from
`berellevy/job_app_filler`. It automatically reuses job application answers and
marks parsed fields with a small icon. Current adapters support Workday and both classic and
React-based Greenhouse forms, plus standard company application forms. Answers are persisted in `chrome.storage.local`;
there is no application backend.

## Stack and layout

- TypeScript, React 18, Material UI/Emotion, and Webpack 5; npm dependencies.
- `src/static/manifest.json`: extension metadata, permissions, and allowed sites.
- `src/contentScript/`: extension-context entry point, answer storage/migrations,
  and release notices. Runs generic forms in isolation; injects a page script only
  for supported ATS hosts. Generic forms use a direct local answer transport.
- `src/inject/`: page-context form discovery, filling, and per-field React UI.
  `inject.ts` selects the site adapter and watches DOM changes.
- `src/inject/app/services/formFields/`: `BaseFormInput` and site-specific
  adapters in `workday/`, `greenhouse/`, and `greenhouseReact/`. Fields are
  discovered with XPath and implement their own reading/filling behavior.
- `formFields/generic/`: job-form detection, semantic HTML field discovery,
  native event-based filling, and dynamic-form lifecycle. The popup can enable
  unrecognized forms manually. Profile inference automatically replaces prefilled
  matches while preserving subsequent edits; other autofill uses the wand's
  saved-answer lookup, including for prefilled fields and default selections.
- The popup's **Review profile updates** compares visible generic fields with
  the local profile directly and applies selected replacements. Local semantic
  rules infer aliases and repeated work/education sections; records map by order.
  Review plans and stale-value checks live in `generic/profileReview.ts`;
  `profileSuggestions.ts` supplies profile-only values without Chrome overrides.
  `generic/profileAutofill.ts` runs these inferred values on discovery and guards
  against overwriting edits or repeatedly filling the same field/context.
- React Greenhouse discovery waits for React properties on its text controls
  before inserting widgets. Its text adapter briefly retries automatic filling
  through initialization resets and updates both the DOM and React form state.
- Each parsed field gets a fixed 16px icon in an isolated shadow root via
  `FieldWidget/fieldIndicatorRoot.ts`. `App.tsx` starts autofill independently of
  the removed per-field toolbar; the icon confirms parsing, not a successful fill.
- `src/shared/`: shared types, components, helpers, and the DOM custom-event
  request/response bridge between page and extension contexts.
- `src/popup/`: extension popup. `src/background/` is currently a placeholder.
- `dist/`: generated unpacked extension; edit source files instead.
- `profile.local.json`: git-ignored personal fallback answers; see
  `profile.example.json` and `docs/local-profile.md`. Chrome matches take priority.

## Local development

- Install dependencies: `npm ci`.
- Development build/watch: `npm start`.
- Load `dist/` via **Load unpacked** in Chrome's extensions developer mode.
- One-time production build: `npx webpack --config webpack.prod.js`.
  Note that `npm run build` also enables watch mode.
- Type check: `npx tsc --noEmit`. Run `npm test` for fallback regression tests;
  verify form interactions manually on supported sites. No lint script is configured.
- `npm run release` builds a versioned ZIP using the manifest version and an
  external `zip` command; it does not publish the extension.

## Notes for future changes

Keep Chrome API access in the extension context; the injected page script uses
the shared event bridge. Answer lookup combines exact and full-text field-name
matching, filtered by section and field type. Preserve stored-answer compatibility
and review migrations when changing these identifiers or the data schema.

The README includes older roadmap details (such as iCIMS); use the manifest and
registered adapters to confirm actual support. README, package, and manifest
versions currently differ. Preserve upstream attribution and `LICENSE.md` notices.
