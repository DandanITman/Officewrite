# End-to-end review

Review date: 2026-09-09. Environment: Windows, Node.js 24.19.0, Chromium,
Electron 39.8.10. CI uses Node.js 22.

This review covers the existing feature set, source and production builds,
browser and native file operations, document formats, release configuration,
and the website. Tests use temporary documents and isolated application data.
The feature catalog in FEATURES.md records product limitations independently
of automated test results.

## Validation

| Area | Evidence |
| --- | --- |
| Shared document logic | 122 passing unit tests: envelopes, accessibility, proofing, references, mail merge |
| Document formats | 70 passing unit tests: DOCX import/export, malformed files, RTF Unicode/code pages, HTML, merge fields |
| Renderer and browser-host logic | 143 passing unit tests: editor behavior, printing, table/paragraph behavior, search, storage failure paths |
| Renderer features | 250 unique passing tests across the full run and focused follow-up runs exercise File, editing, ribbon state, keyboard commands, Insert/Layout/Review/View, references, tables, mailings, templates, edge cases, save races, and import errors |
| Production browser | 4 passing tests load the built app with its real host: DOCX download/save/reopen after reload, preferences, OPFS copy/rename/delete, version history, and the PDF print-dialog route |
| Visual regression | 27 passing Windows screenshot comparisons; no baselines replaced |
| Native Electron | 13 passing tests cover PDF bytes, dictionaries, persistence, close guard, associations, version isolation, file operations, and print callback/error/page-range behavior |
| Packaged Windows executable | Unpacked production build launches with app.isPackaged=true; editing, all four bundled dictionaries, and a real 17,103-byte PDF export pass |
| Build and types | Desktop and browser builds and all TypeScript projects compile |
| Website/release tooling | Source and complete built asset checks, JavaScript/YAML parsing, release-note success/error cases, release fallback and feature-tour keyboard behavior |
| Project tooling | Project configuration loads in the installed command-line client; both repository skills pass the skill validator |

The browser harness uses a mocked host for repeatable UI tests. The separate
production-browser suite uses real OPFS and localStorage. Operating-system file
pickers and printer callbacks are controlled in automated native tests; this is
not evidence that every printer or third-party document renders identically.

## Corrections made

- New/Open now requires an explicit discard decision before replacing unsaved
  content. Failed saves retain dirty state and show an error.
- Failed deletion retains the open document and its edits; copying stops when
  saving the source fails.
- Edits made during a save remain dirty. Late save and history responses cannot
  change another document opened while those requests were pending.
- First Save, Save As, and rename preserve the editor instance, live content,
  and undo history. Corrupt files and read errors show an alert without replacing
  the existing document.
- Native document saves retain the complete metadata envelope.
- Preferences are loaded before persistence runs. Search crosses formatting
  boundaries, replacement treats markup as text, and counts follow edits.
- Version-history directories derive from the entire normalized file path;
  revision IDs remain distinct for rapid saves.
- Printing uses zero-based native page indexes and observes completion,
  cancellation, invalid input, and driver failures.
- Malformed DOCX files fail clearly. RTF round-trips Unicode, surrogate pairs,
  hard breaks, ANSI code pages, and group-scoped Unicode fallback lengths.
- Browser storage waits for initialization; failed rename/copy/save operations
  no longer masquerade as successful writes. Failed disk writes retain a browser
  backup and keep the disk handle available for retry.
- Browser PDF export uses the print destination dialog without first creating
  an empty disk file through a separate picker.
- Release QA and packaging share one immutable source tag. Source pushes run
  CI without publishing installers, rewriting versions, or deploying the site.
- Website download failures, feature-tour focus, nested error-page assets,
  documentation claims, and test artifact paths are corrected.

## Remaining limitations and follow-up

- The production dependency audit reports 38 moderate package entries caused
  by one shared TipTap core advisory, with zero high/critical entries in npm's
  report. The upstream advisory assigns High severity. Application-specific
  exploitability has not been established by this functional review. The
  published fix is in TipTap 3.30.4; this app uses the version 2 editor family.
  Plan a coordinated major-version migration and rerun the full feature suite.
  See the [upstream advisory](https://github.com/ueberdosis/tiptap/security/advisories/GHSA-cp6q-959q-f8rh).
- Version history from the old truncated-path scheme cannot be safely assigned
  to a document when paths collided. Those old files are preserved on disk but
  excluded from the new history list.
- LibreOffice conversion of legacy binary .doc files, actual physical printers,
  installer installation/uninstallation and operating-system associations after
  installation require separate checks in the relevant environment.
- Chromium is covered. Firefox, Safari, private browsing, mobile devices,
  assistive technology, and broad Microsoft Word/LibreOffice fidelity remain
  outside the automated evidence recorded here.
- Browser storage is local to the site. Clearing site data removes documents;
  unsupported persistent storage falls back to memory for the page session.
  Browser deletion has no system recycle bin. Keep downloaded backups.
- Browser spelling dictionaries and legacy .doc conversion require the desktop
  edition. Browser PDF output uses its print dialog. Live pagination, rich
  headers/footers, sections, macros, and other limits remain in FEATURES.md.
- Production builds warn about the large editor bundle and a mixed static/dynamic
  hyperlink import. These warnings do not prevent a successful build.
- The default installer-output folder encountered a local Windows EPERM during
  unpacking. The same package build succeeded with an isolated temporary output
  directory. Installation and uninstallation were not run.
- Site/domain migration and a public installer release are separate explicit
  operations. This review does not claim that either has been deployed.
