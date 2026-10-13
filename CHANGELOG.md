# Changelog

Versions follow [SemVer](https://semver.org/). To release: add a section here, bump the version in `package.json` (`npm version x.y.z --no-git-tag-version`), commit, then push a `vx.y.z` tag. GitHub Actions builds the installer and creates the release with this section's text.

## [1.4.2] - 2026-10-13

### Added
- MIT license, contributing guide, security policy, English issue templates.

### Changed
- Updates no longer need `gh`: the public repository answers without an account.
- README visuals redone without the brightness slider.

## [1.4.1] - 2026-10-13

### Removed
- Display brightness slider: its DDC/CI commands disturbed some monitors. Follet no longer talks to them at all.

## [1.4.0] - 2026-10-13

### Added
- English interface: Settings → Appearance → Language (automatic from Windows, French or English). The tray menu follows too.
- `scripts/i18n-extract.js` lists untranslated strings; `I.i18nMissing()` lists the ones seen on screen.

## [1.3.1] - 2026-10-13

### Added
- Windows notifications in the notch: app icon, title and text for a few seconds. Settings → Activities → Windows notifications.

## [1.3.0] - 2026-10-13

### Added
- Updates: Follet checks for new versions and installs them from Settings → About (or the tray menu).
- fastfetch-style system info in Stats (terminal button).
- Settings → Behavior → Open on hover: fast, normal or slow.

### Changed
- The preview no longer opens when the mouse just passes by (on its way to a browser tab, for example): it has to linger.
- The installed version repairs its Start with Windows entry if it points somewhere else.
- README: new visuals, without personal data.

## [1.2.1] - 2026-10-13

### Fixed
- Drag and drop: the notch stayed in preview under the drop targets. It now stays in drop mode for the whole gesture, then confirms the drop.

### Added
- Automatic build and release with GitHub Actions; code check on every push.

## [1.2.0] - 2026-10-13

### Added
- New mascot, drawn from XCANT's sketch: a small glowing coral flame, big shiny eyes, a ":3" mouth, pink cheeks and a wisp.
- Moods: headphones while music plays, halo and dots while the AI thinks, wink and sparkles when the answer arrives, nightcap after 5 idle minutes, big eyes and "!" for alerts.
- Settings → Appearance → Follet's color: coral or app colors.

### Fixed
- The audio output picker did not open.
- Some app icons did not load; dead shortcuts are removed.
- The album art sometimes stayed on the previous song.

## [1.1.0] - 2026-10-13

### Added
- Follet tab: Chat and Usage views (Claude Code 5-hour window, tokens, messages, sessions, hour by hour, by model, by project).
- File drop with two targets: Shelf and Ask Follet (reads text files).
- Keyboard (1 to 9, arrows) and scroll-wheel navigation on the tabs.

### Changed
- Fixed-size panel: no more layout recalculation while opening.
- Brightness: a single slider, the icon picks the display.

## [1.0.0] - 2026-10-13

### Added
- First installable version: Material You notch with music, calendar and weather, stats, shelf, clipboard, launcher, terminal, AI of your choice and power.
- Log in `%APPDATA%\Follet\logs`, welcome screen, start with Windows.
