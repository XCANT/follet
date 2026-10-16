# Contributing to Follet

Thanks for wanting to help! Bug reports, ideas, translations and pull requests are all welcome. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md); accessibility barriers are bugs too ([ACCESSIBILITY.md](ACCESSIBILITY.md)).

## Getting started

Requirements: Windows 10/11 and Node.js 20+.

```bash
npm install
npm start
```

Before opening a pull request, run `npm run check` (syntax, ASCII-only `helper.ps1`, matching versions). GitHub Actions runs it too.

## Guidelines

- **Commits and pull requests in English**, short and descriptive (`Fix stale album art after track change`).
- Keep pull requests focused: one fix or feature at a time.
- The UI source text is French; every visible string needs its English in [`src/i18n/en.js`](src/i18n/en.js). `node scripts/i18n-extract.js` lists the missing ones.
- `src/main/helper.ps1` runs in Windows PowerShell 5.1 (needed for WinRT) and must stay ASCII-only.
- Never commit personal data: config, keys and history live in `%APPDATA%\Follet`, not in the repository.
- Test your change in the app (`npm start`). The test hooks (`FOLLET_DEMO`, `FOLLET_EVAL`, `FOLLET_CAPTURE`) are described in the README.

## Releasing (maintainers)

1. Add a section to [CHANGELOG.md](CHANGELOG.md).
2. `npm version x.y.z --no-git-tag-version`, then commit.
3. `git push`, then `git tag vx.y.z` and `git push origin vx.y.z`.

GitHub Actions builds the installer and publishes the release.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).