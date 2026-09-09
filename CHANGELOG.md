# Changelog

All notable changes to Officewrite are recorded here. Help > What's New shows this
file inside the app.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
Officewrite uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Preserve unsaved work when creating or opening another document, keep the
  document dirty after failed saves, and report saving and printing errors.
- Keep edits made during a pending save marked unsaved, and prevent a completed
  save or history request from changing a different document opened meanwhile.
- Preserve live editor content and undo history across first Save, Save As, and
  rename; show import/read errors without replacing the open document.
- Retain the open document after failed deletion and stop creating a copy if
  its prerequisite save fails.
- Preserve all native document metadata, including endnotes, sources,
  citation styles, style sets, and editing restrictions.
- Keep saved preferences across startup; find text across formatting changes,
  replace the selected match as literal text, and refresh live search counts.
- Isolate version history by complete document path and give rapid saves unique
  revision IDs. Ambiguous legacy history remains on disk but is not displayed.
- Translate print page ranges to the native engine's page indexes and wait for
  its completion callback, preserving cancellation and error results.
- Reject malformed DOCX containers; preserve Unicode, hard breaks, code pages,
  and Unicode fallback lengths in RTF; clean temporary legacy import files.
- Prevent browser rename/copy failures from deleting or inventing files, retain
  recoverable browser copies on disk-write failure, and wait for shared storage
  initialization. Report version-history storage quota failures.
- Send browser PDF export directly to its print destination dialog without
  first creating an empty file through the disk picker.
- Handle missing releases and API failures on the website, fix nested error-page
  assets, and support consistent keyboard navigation through the feature tour.

### Build and development

- Start the repository with a fresh source history and consolidated project
  configuration, instructions, and regression/release skills.
- Make Windows releases and website deployment explicit; remove automatic
  version-bump commits and publication on source pushes.
- Run release checks and packaging against one immutable tag from main history,
  enforce version consistency, and publish canonical changelog notes with the
  installer. Fail releases that omit the installer.
- Require Node.js 22 or newer and pin Electron to the same 39.8.10 version used
  by development and packaging.
- Add production browser storage tests to local regression and CI, extend native
  and renderer failure coverage, verify complete website build assets, correct
  visual artifact collection, and fail when native QA cannot run.
- Require explicit opt-in before browser tests reuse an existing local server.

### Documentation

- Correct browser/desktop capability differences, first-release download
  guidance, testing coverage, and development/publishing instructions.
- Record end-to-end review results, outstanding compatibility limits, and the
  existing editor dependency advisory in docs/REVIEW.md.

## [0.5.0]

Initial public release.

### Added

- A word processor that runs in the browser or offline on Windows, with no
  account and no subscription.
- Opens and saves `.docx`, and reads `.doc`, `.rtf`, `.odt`, `.txt`, `.md` and
  HTML.
- Writing: fonts, colours and text effects, bullets, numbering, checklists and
  multilevel lists, tables, pictures with seven wrap modes, shapes, text boxes
  and freehand ink.
- Structure: a styles gallery, style sets, a table of contents that keeps
  itself current, footnotes and endnotes, captions, cross-references, an index,
  and citations in APA, MLA, Chicago or IEEE.
- Review: spelling and grammar, a built-in offline thesaurus, word count and
  readability, tracked changes, threaded comments, document compare and an
  accessibility checker.
- Mailings: a complete mail merge, envelopes and labels.
- Layout: page setup, margins, columns, line numbers, headers and footers,
  watermarks and print preview.
