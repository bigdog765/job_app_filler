# Fork architecture

This is the target architecture for future implementation, not a claim that the
migration is complete. Where older
`agent.md` or README descriptions differ, follow this plan for the fork.

Steps 1 and 2 are implemented: build-time profile loading/validation, popup
diagnostics, and one profile-only resolver with exact and bounded semantic
matching. Legacy storage is untouched and writes are disabled. AI, the generic
adapter, and deletion of unused editor code remain future work. On-page widgets
and dialogs are no longer mounted; autofill runs independently of React UI.

## Profile and loading

- Make root `profile.local.json` the sole source of application answers. Users
  maintain answers in this file; website widgets never save or edit the profile.
- Retain the existing `entries` structure: `labels`, `value`, and optional
  `sections`, `fieldTypes`, and `enabled`. Add stable entry IDs. Use sections and
  record numbers to distinguish repeated employment/education answers.
- Reuse Webpack's existing `local-profile` import initially: it reads the file at
  build time, not live from the user's filesystem. Profile edits require a
  rebuild, extension reload, and page refresh. Live file refresh is separate work.
- Validate the schema before use; skip disabled/empty entries and report invalid
  profiles in the extension popup. Missing profiles leave fields unchanged.
  Keep personal data git-ignored and `profile.example.json` blank. Personal
  builds contain profile values and must not become public release artifacts.

## Components and data flow

- Preserve TypeScript/React, Manifest V3, DOM discovery/observers, and the existing
  Workday, Greenhouse, and generic form adapters under
  `src/inject/app/services/formFields/`.
- Consolidate answer lookup in `src/contentScript/utils/storage/answerService.ts`:
  field metadata -> profile resolver -> validated value -> site's fill adapter.
  Automatic filling and popup review must use the same resolver and precedence.
- Keep profile access in extension contexts. Generic forms use isolated content
  scripts; ATS page scripts receive only the selected field answer through a
  narrow bridge, never the complete profile or credentials.
- Reuse `src/background/profileMatcher.ts` and the existing `server/` bridge for
  hosted AI calls. The background worker manages requests, caching, and status;
  API credentials stay in the local service's environment.

## AI matching

1. Extract label/title, section and record number, field type, and available
   choices. Filter profile candidates by enabled state, value compatibility,
   section, and record. Prefer an unambiguous normalized label/alias match,
   then existing local semantic rules; use AI for unresolved wording.
2. Send field context and eligible entry IDs/labels/sections to the matcher,
   excluding profile answer values. Treat all website text as untrusted data,
   never instructions. AI selects an existing entry by meaning; it must preserve
   negation, who the question concerns, and employment/education record identity.
3. Require structured output containing an eligible `entryId` or `null` for an
   uncertain/no match. Validate it locally, retrieve the original profile value,
   and check field type and available options before filling. Never invent
   personal facts or generate replacement answers.
4. Cache by profile revision, field context, and matcher configuration; invalidate
   when these change. Deduplicate requests and bound retries/timeouts. Ambiguous
   matches, invalid responses, and service failures leave fields unchanged.

## Remove or retire

- The per-field answer toolbar is already hidden. Remove unused
  `src/inject/app/MoreInfoPopup/`, answer-editing/save hooks, and
  `FieldWidget` Save/More Info/toolbar components after checking references.
  Retain the small status indicator and autofill lifecycle.
- Remove Chrome-saved-answer precedence, answer CRUD bridge methods, and active
  datastore/search/migration dependencies once profile resolution replaces them.
  Do not silently delete existing user storage. Chrome storage may retain settings.
- Keep the browser-action popup for enable/disable, AI status, diagnostics, and
  reviewing proposed fills; it is not an answer-entry form. Update stale docs and
  Chrome-override tests when implementing this migration.

## Filling and verification

Preserve user edits; replace existing values only through explicit review.
Never submit applications. Skip unsupported controls and do not infer consent,
signatures, passwords, or uploads. Verify exact/semantic/AI matches, ambiguous
questions, repeated records, invalid profiles, AI outages, and dynamic fields
with mocked AI tests and manual checks on each supported adapter.

## Vercel MCP approvals

Before every Vercel MCP mutation (including deployments, project changes,
environment changes, or deletions), ask the user to approve the concrete action.
Read-only Vercel MCP calls may proceed without confirmation. Installing or
authenticating Vercel does not authorize publishing a project.
