---
name: officewrite-regression
description: Review Officewrite features and add regression coverage for editor, document-format, browser-storage, or native Electron bugs.
---

# Officewrite regression work

Read AGENTS.md first. Run checks only when Daniel has requested verification
in the current turn. An explicit end-to-end review authorizes relevant checks.

Choose the test layer that can expose the actual failure:

- packages/core/src and packages/openxml/src contain Vitest document tests.
- apps/desktop/src contains Vitest editor and browser-host tests.
- tests/e2e drives real renderer controls through a mock host at test.html.
  Reuse tests/helpers/playwright.ts; seed files through the host fixture, then
  interact through visible controls. Do not inject editor state to bypass UI.
- tests/electron launches the built Electron app with temporary user data.
- tests/visual compares committed Windows screenshots. Inspect differences;
  do not accept new baselines just to make a failing check green.
- Production browser checks must load the web build with its real host bridge.

Available commands are in package.json. npm run regression runs the aggregate
checks. Set OFFICEWRITE_TEST_PORT to an unused port for parallel browser runs
and use separate output directories. The screenshot marketing capture is
opt-in and is not a feature regression test.

Record fixes and validation limits in CHANGELOG.md and the review report when
one is requested. Native file dialogs, real printers, and third-party document
compatibility need separate evidence; mock success is insufficient.
