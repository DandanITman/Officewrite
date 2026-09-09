# End-to-end review

Review version: 0.6.2. Date: 2026-09-09. Environment: Windows, Node.js 24.19.0, Chromium,
Electron 39.8.10. CI uses Node.js 22.

This review covers the existing feature set, source and production builds,
browser and native file operations, document formats, release configuration,
and the website. Tests use temporary documents and isolated application data.
The feature catalog in FEATURES.md records product limitations independently
of automated test results.

## Validation

| Area | Evidence |
| --- | --- |
| Shared document logic | 128 passing unit tests: envelopes, accessibility, proofing, references, mail merge |
| Document formats | 80 passing unit tests: DOCX import/export, table dimensions/styles, malformed files, RTF Unicode/code pages, HTML, merge fields |
| Renderer and browser-host logic | 186 passing unit tests: editor behavior, all template schemas, styled template round-trips, switching table styles after DOCX reload, table/paragraph behavior, search, browser storage and native atomic-write failure paths |
| Renderer features | All 288 tests pass together in the final Linux release gate: File, editing, ribbon state, keyboard commands, Insert/Layout/Review/View, references, tables, mailings, templates, edge cases, save races, import errors, actual PDF pagination and both fallback-font ribbon regressions; nine opt-in screenshot generators are skipped in the normal suite |
| Production browser and website | 9 passing tests: real OPFS DOCX save/reopen, preferences, copy/rename/delete, version history, browser PDF print route, all nine tour images, Templates keyboard/phone-width access, installer links and release-API failure fallback |
| Visual regression | 27 passing Windows screenshot comparisons; the redesigned gallery baseline was inspected and updated, with all other baselines retained |
| Native Electron | 18 passing tests cover four dictionaries, persistence, close guard, command-line opening, version isolation, file operations, concurrent copying, print callback/error/page-range behavior, three styled template PDF exports and a long multi-page PDF through File > Export |
| Packaged Windows executable | The same 18 tests pass against the unpacked 0.6.0 and 0.6.1 production executables with app.isPackaged=true and isolated user data; the later 0.6.2 table-panel layout is checked separately |
| PDF appearance | Rendered and inspected every page of final native Invoice, Project Brief, Creative Brief and a four-page, 100-paragraph document: white margins, complete content, retained typography/table fills, no editor scrollbars or resize highlights |
| Build and types | Desktop and browser builds and all TypeScript projects compile |
| Website/release tooling | Source and complete built asset checks, synchronized versions, canonical release-note generation, and em-dash checks pass; all nine actual app screenshots regenerated |

The browser harness uses a mocked host for repeatable UI tests. The separate
production-browser suite uses real OPFS and localStorage. Operating-system file
pickers and printer callbacks are controlled in automated native tests; this is
not evidence that every printer or third-party document renders identically.

After the 0.6.1 ribbon correction, all 27 visual comparisons and eight focused
renderer checks passed, including both narrow-width cases, wider tab labels,
keyboard navigation and table AutoFit. Typechecking, the desktop build, site
source validation and the em-dash check also passed. The tagged release workflow
reruns the complete regression and Windows gates before publishing an installer.

After the 0.6.2 table-panel correction, all 24 table tests and all 27 visual
comparisons passed with no baseline changes. The new test applies Arial and
wider letter spacing to the entire panel at 900px, checks all control bounds,
and uses the style and shading menus. The two-row layout was visually inspected.
Typechecking, the desktop build and canonical release-note generation passed.

The final [0.6.2 release gates](https://github.com/DandanITman/OfficeWrite/actions/runs/34416486352)
passed from commit e64ccb4: Linux ran all 394 unit tests, nine production-browser
and website tests, 288 renderer tests and 18 native Electron tests; Windows ran
all 27 visual comparisons and 18 native Electron tests. Both narrow-window
regressions passed on Linux. The source builds, type checks, site asset checks
and release-note validation passed as well.

## Corrections made

- Separate the scrolling ribbon tab list from Comments, editing mode and layout
  controls. The initial 0.6.0 Linux release run exposed overlap at 900px despite
  passing local Windows tests; it passed 285 other renderer cases and the Windows
  gate, but no installer was published. Add a wider-label regression that uses
  ordinary clicks and keyboard navigation to cover font-dependent overflow.
- The 0.6.1 Linux release run then reached the table panel and exposed clipped
  style and shading controls at 900px. Its other 286 renderer tests and the
  Windows gate passed; no installer was published from that tag.
- Allow complete Table Layout groups to wrap onto another row in the classic
  ribbon when their measured widths exhaust the available space, preserving
  readable controls instead of clipping the last group.
- Add eight templates and refresh the 31 existing designs. The gallery now has
  39 designed templates plus a blank document, Creative filtering, counts, clear
  filters, readable previews and keyboard focus handling. Template formatting
  is stored in the document; representative DOCX round-trips retain it.
- Add the website Templates tour tab and refresh the app screenshots.
- Table insertion supports precise dimensions, an optional header and keyboard
  operation. Styles render in the resizable view, selection addresses real
  cells, merged-cell sizing respects spans and zoom, and row sorting preserves
  headers and surrounding text. Table styles and dimensions survive DOCX.
- Keep browser imports with identical names separate from existing documents
  and preserve the right disk handle across Save As. Reject invalid names and
  show picker, storage, rename, copy and export failures.
- Replace native documents, PDFs, settings and recent-file lists only after a
  complete temporary file has been flushed. Concurrent copies cannot overwrite
  each other. Validate nested native nodes, marks and schema structure before
  adopting a document, preventing silent conversion of malformed input to blank.
- Recheck live dirty state after slow reads and ignore obsolete open requests.
  Serialize the complete save pipeline per destination, including conversion,
  so Save-and-close waits for the newest content to reach disk.
- Preserve zero DOCX margins and paragraph spacing, paragraph border sides,
  table shading, widths, heights and merged cells.
- Store automatic DOCX table fills as conditional styles, keeping manual shading
  separate so styles can still be changed after reopening. Preserve pasted RGB
  colors as well as hexadecimal colors.
- Print in normal document flow instead of inside fixed screen containers.
  Remove canvas backgrounds, scrolling and resize decorations; retain table
  proportions, continue long documents across pages, and honor explicit page
  breaks in single-column and multicolumn layouts.
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
- Packaging uses an isolated temporary output directory for local checks.
  Installation and uninstallation were not run.
- Publication is recorded by the tagged GitHub release and Pages workflow;
  local build results alone are not evidence of deployment.
