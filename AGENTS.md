User preference:
- Do not run tests, visual checks, browser QA, screenshot capture, or automated verification unless Daniel explicitly asks for it in the current turn.
- Do not create screenshot files, browser profile folders, test artifacts, temporary QA logs, or similar generated checking output in project workspaces unless explicitly requested.
- Leave final testing and visual review to Daniel. If verification would normally be recommended, mention what Daniel may want to check instead of running it.

Attribution:
- Never credit an AI assistant anywhere in the project's written record. That
  means no `Co-Authored-By` trailer naming an assistant, no "Generated with"
  line, no robot emoji, and no mention in commit messages, pull request titles
  or bodies, changelog entries, release notes, issue comments, or the site.
- This applies to text written on Daniel's behalf. The work is published under
  his name, and a tool credit in the history is noise a reader has to filter.
- Code comments describe the code, never who or what wrote it.

Project context:
- This is an npm workspace: Electron + React + TipTap in apps/desktop,
  shared document logic in packages/core, and import/export in packages/openxml.
- Use the project model configuration in .codex/config.toml. Keep credentials,
  machine permissions, and account configuration outside the repository.
- Repository skills live in .agents/skills. Use the regression skill for feature
  fixes and the release skill when publishing is requested.
- For independent tasks, subagents may work in parallel with explicit file
  ownership. Prefer a less expensive model for straightforward bounded work
  when it can maintain the same quality; use the primary model for complex work.
- Keep CHANGELOG.md synchronized with material changes. Preserve MIT notices.
- Browser harness tests use a mock host; production browser storage and native
  Electron behavior need their own coverage. Do not claim those work from mock
  tests alone.
- Releases and site deployment are explicit workflows. A source push alone
  must not create a version bump commit, tag, installer, or website deployment.
