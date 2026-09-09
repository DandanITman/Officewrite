# Officewrite testing guide

Officewrite uses a layered regression suite:

1. **Typecheck + build**: compile the Electron/React app, browser app and shared packages; check the site artifact
2. **Unit/component tests**: Vitest for document logic, OpenXML, and TipTap editor behavior
3. **End-to-end tests**: Playwright click-through flows against a browser test harness
4. **Electron tests**: launch the real main process and exercise the native host bridge
5. **Browser host tests**: run the production web build with its real browser storage bridge
6. **Visual regression**: Playwright screenshot baselines for key UI states

Run everything locally with one command:

```bash
npm run regression
```

## Quick commands

| Command | Purpose |
|---------|---------|
| `npm run regression` | Full suite (typecheck, desktop/web builds, Pages files, unit, e2e, Electron, visual) |
| `npm test` | Unit/component tests only |
| `npm run test:unit` | Same as `npm test` |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:e2e:headed` | E2e tests with visible browser |
| `npm run test:electron` | Tests against a real launched Electron app |
| `npm run test:web` | Build the production browser app and test its real storage bridge |
| `npm run test:visual` | Playwright visual snapshot tests |
| `npm run test:visual:update` | Refresh visual baselines after intentional UI changes |

Equivalent commands work with npm workspaces from a fresh clone after `npm ci`.

## First-time setup

```bash
npm ci
npx playwright install chromium
```

Use Node.js 22 or later. Playwright browser install is required once per machine/CI image. The regression script assumes dependencies are already installed. On headless Linux, install `xvfb` as well: the full regression command fails if it cannot launch the Electron tests.

**Note:** Playwright is a local project dependency, not a global command. Use `npm run test:e2e` or `npx playwright test`; running `playwright test` directly in PowerShell will fail with "not recognized".

## Why tests may not drive the editor directly

The suite used to expose `runEditorCommand`, which called TipTap commands
straight from a test. Ten tests used it, including one named "applies heading
style from ribbon" that never touched the ribbon, so the wiring between the
controls and the editor shipped almost entirely untested, and the ribbon's
state went stale on every caret move without a single test noticing.

That escape hatch is gone. Tests click real controls. If a control is hard to
reach from a test, that is a signal about the control, not a reason to reach
past it.

The same applied to dialogs: `uiPrompt` had a test-mode branch that fell back
to `window.prompt`, so tests drove native dialogs while users only ever saw the
in-app one. Use `answerPrompt` and `dismissAlert` instead.

## How the browser harness works

The browser suite runs without Electron IPC. Playwright loads `apps/desktop/test.html`, which:

- installs an in-memory `window.officewrite` mock (`tests/helpers/mock-officewrite.ts`)
- persists mock files in `localStorage` for save/reload scenarios
- disables animations via `[data-test-mode]`
- exposes `window.__OFFICEWRITE_TEST__` helpers for deterministic file dialogs and editor content injection
- uses the same in-app prompts and alerts as the desktop renderer; helpers answer those dialogs through their controls

This keeps tests local, deterministic, and free of production services.

The separate `tests/web/` suite builds and serves the production browser app using `playwright.web.config.ts`. It covers document creation and persistence through Origin Private File System (OPFS) storage, reopening documents, and saved settings. It exercises the real browser host rather than the renderer mock. The harness suite remains responsible for the wider editor UI flows.

## Updating visual snapshots

When you intentionally change UI layout, theme, or ribbon styling:

```bash
npm run test:visual:update
```

Review the changed PNGs under:

- `tests/visual/screens.spec.ts-snapshots/`
- `tests/visual/narrow.spec.ts-snapshots/`
- `tests/visual/extended.spec.ts-snapshots/`

Commit updated baselines together with the UI change.

## Reading screenshot diffs

When a visual test fails, Playwright writes:

- `*-expected.png`: committed baseline
- `*-actual.png`: current render
- `*-diff.png`: highlighted differences

Local HTML report:

```bash
npx playwright show-report
```

In GitHub Actions, download the `visual-snapshot-diffs` artifact from a failed run.

## Adding a new regression test

Tests must exercise the feature through the UI a user actually touches. A test that drives the editor directly proves TipTap works, not that Officewrite's controls are wired to it.

### Unit/component

1. Add a `*.test.ts` file next to the logic under test, or in `packages/core` / `packages/openxml`.
2. Reuse fixtures from `tests/fixtures/regressionDocument.ts` when document content matters.
3. Run `npm test`.

Desktop editor behavior tests live in `apps/desktop/src/editor/editorBehavior.test.ts` and use a TipTap test editor helper.

### End-to-end

1. Add a spec under `tests/e2e/`.
2. Prefer `data-testid` selectors already on ribbon/editor/home elements.
3. Use helpers in `tests/helpers/playwright.ts`.
4. Seed files through `window.__OFFICEWRITE_TEST__` rather than real disk paths.

### Visual

1. Add a screenshot assertion under `tests/visual/`.
2. Mask dynamic regions (status bar counts, filename dirty marker, avatars) via `visualMaskLocators()`.
3. Generate baselines with `npm run test:visual:update`.

Visual snapshots catch differences from the committed baseline. If a bad layout is accepted into the baseline, snapshots will keep passing. Add e2e layout assertions for clipping, offscreen controls, broken picker/dropdown interaction, and other UI problems that need semantic detection.

## Current coverage

### Covered

- Blank document creation from home screen
- Typing and basic editor rendering
- Bold / italic / underline toolbar actions
- Font size and alignment controls
- Ribbon Cut, Copy and Paste buttons
- Bullet and numbered lists
- Undo / redo
- Save to mock filesystem and reload/open restore
- New document + return to home
- Save backstage panel open
- Visual baselines: home, empty editor, formatted document, ribbon, canvas, backstage, narrow viewport, dark theme home
- Layout guard for primary app controls being visible and unclipped
- Document envelope create/serialize/parse
- OpenXML export + `.officewrite` round-trip (existing package tests)

### Known coverage gaps

- Text highlight color
- Custom page margins and landscape output (the margin preset selector is covered)
- Decrease paragraph indent (increase is covered)
- Accept/reject single track change (accept/reject all is covered)
- Multi-page print pagination layout

### Out of scope (not built, no tests planned)

- Password protection, section breaks, macros and cloud sync

Inline equations, document comparison and the offline thesaurus are implemented. Their format and data limitations are listed in [FEATURES.md](FEATURES.md).

### Electron-only (optional manual)

- Native OS file open/save dialogs

## CI layout

GitHub Actions runs two jobs:

- **regression** (Ubuntu): typecheck (app, Electron main and tests), desktop/web builds, real browser storage tests, site artifact validation, unit tests, browser e2e tests and Electron tests under Xvfb
- **visual** (Windows): screenshot regression tests against committed baselines

Visual snapshots are generated on Windows. Run `npm run test:visual:update` on Windows before committing baseline changes.

Pushing to `main` runs these checks without making version commits, tags or releases. Releases require an explicit version tag or a manual dispatch of `release.yml`. The tag must belong to `main` history. Every release job checks out the same resolved tag commit; publication waits for both the regression and Windows visual/native test gates. Manifest versions must match the tag, and the matching changelog section supplies the release notes. Pages deployment is manual and requires configuring Pages and the custom domain for the new repository first.

## Safety rules

- Tests use mock/local fixtures only. No production services or real user data.
- Existing package tests were kept; the old in-app “Visual QA Auto-Pilot” was removed in favor of this Playwright-based suite.
- Do not skip failing tests without documenting why in this file.

## Electron tests

`npm run test:electron` builds the app and launches the real main process with
Playwright's `_electron` API, against a throwaway `userData` directory.

This layer previously had no coverage at all: everything ran against the
browser harness, so `main.ts`, `preload.ts`, `spell.ts` and `docImport.ts` were
never executed, and the file that claimed to cover them contained three skipped
`expect(true).toBe(true)` bodies behind a `testIgnore`.

The Electron suite covers the full host bridge surface, Hunspell against the
dictionaries the installer actually ships, the persisted user dictionary, real
file reads and writes, the revision store, real PDF output, settings surviving
a restart, the unsaved-changes guard, and opening a document passed on the
command line.

On Linux it needs a display: `xvfb-run -a npm run test:electron`.

If your machine has a pre-provisioned browser at a revision that does not match
the pinned Playwright, point the browser suite at it with
`OFFICEWRITE_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

Use `OFFICEWRITE_TEST_PORT` to move the browser harness off port 5173. Playwright starts its own server by default and reports a port conflict instead of silently testing another application. To reuse a server you started for Officewrite, explicitly set `OFFICEWRITE_REUSE_TEST_SERVER=1` outside CI.

The eight site screenshot capture cases are skipped during ordinary e2e runs. Set `OFFICEWRITE_CAPTURE=1` only when intentionally refreshing `docs/shots/`.
