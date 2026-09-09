# Contributing to Officewrite

Officewrite is a **non-profit educational project** and **free, open-source alternative to Microsoft Word**. We welcome contributors of all skill levels: students, teachers, developers, and anyone who wants to help make free word processing better for everyone.

## Ways to contribute

- **Report bugs**: [Open an issue](https://github.com/DandanITman/OfficeWrite/issues) with steps to reproduce
- **Suggest features**: Especially features that help education and accessibility
- **Submit code**: Fork, branch, test, pull request
- **Improve docs**: README, testing guides, classroom materials
- **Add tests**: See `docs/testing.md` and `.agents/skills/officewrite-regression/`

## Development setup

```bash
git clone https://github.com/DandanITman/OfficeWrite.git
cd OfficeWrite
npm ci
npx playwright install chromium
npm run dev
```

## Before you open a PR

```bash
npm run regression
```

This runs the checks listed in `scripts/regression.mjs`, including typecheck,
builds, unit tests, browser tests, Electron tests, and visual regression.

## Repository tooling

Codex reads project instructions from `AGENTS.md`, skills from `.agents/skills`,
and the Astra model default from `.codex/config.toml`. Trust the project to load
its configuration. Account credentials and machine permissions stay in your
user configuration. See the [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Run `npm run dev` for Electron, or `npm run dev:test -w @officewrite/desktop`
for the browser test harness. To preview the production browser app, run
`npm run build:web` and serve `docs` locally; open `/app/`.

Source pushes run CI. Windows releases and website deployment are explicit
workflows; see `.agents/skills/officewrite-release/SKILL.md`.

## Project values

1. **Free for everyone**: No paywalls, no subscriptions, no license keys
2. **Educational first**: Clear code, good docs, safe defaults for learners
3. **Open source**: Anyone can read, fork, and improve the project
4. **Local & private**: Documents stay on the user's machine by default
5. **No vendor lock-in**: Support open formats (DOCX, plain text, `.officewrite`)

## Code of conduct

Be respectful and constructive. This project exists to help people learn and create, so keep it welcoming.
