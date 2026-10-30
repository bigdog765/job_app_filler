# Repository summary

Job App Filler is a Chrome Manifest V3 extension forked from
`berellevy/job_app_filler`. It adds per-field controls to save, edit, and reuse
job application answers. Current adapters support Workday and both classic and
React-based Greenhouse forms. Answers are persisted in `chrome.storage.local`;
there is no application backend.

## Stack and layout

- TypeScript, React 18, Material UI/Emotion, and Webpack 5; npm dependencies.
- `src/static/manifest.json`: extension metadata, permissions, and allowed sites.
- `src/contentScript/`: extension-context entry point, answer storage/migrations,
  and release notices. Loads saved data before injecting the page script.
- `src/inject/`: page-context form discovery, filling, and per-field React UI.
  `inject.ts` selects the site adapter and watches DOM changes.
- `src/inject/app/services/formFields/`: `BaseFormInput` and site-specific
  adapters in `workday/`, `greenhouse/`, and `greenhouseReact/`. Fields are
  discovered with XPath and implement their own reading/filling behavior.
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
