---
name: officewrite-release
description: Prepare or publish an Officewrite Windows release or GitHub Pages deployment when the user requests release work.
---

# Officewrite releases

Read AGENTS.md, package.json, and the requested .github/workflows file. Source
pushes do not automatically publish. Do not infer permission to publish from
an ordinary code edit; use authorization already present in the conversation.

For Windows releases, synchronize all four workspace package versions and the
lockfile with npm version VERSION --workspaces --include-workspace-root
--no-git-tag-version. Also update softwareVersion in docs/index.html.

Move the applicable Unreleased notes into an exact ## [VERSION] changelog
heading. scripts/generate-release-notes.mjs extracts that section. Keep notes
specific to actual included changes and state any compatibility limits.

Run authorized QA before publishing and fix failures. If local QA is not
authorized, use the release workflow's checks and report what was not exercised
locally. Never describe a skipped check as passing.

Publish only a tag pointing to the intended main commit, or use the release
workflow's manual dispatch with that tag. Inspect the current workflow inputs.
Never delete and recreate a published tag to retry; use a new patch release.
Check the resulting release contains the Windows installer and release notes.

GitHub Pages uses an explicit workflow dispatch. Configure Pages to use GitHub
Actions before deploying. The custom domain must be attached to this repository
before claiming officewrite.com is served by it. Build docs/app from source;
it is ignored output and must not be committed.
