# Changelog

Versions follow [SemVer](https://semver.org/). To release: add a section here, bump the version in `package.json` (`npm version x.y.z --no-git-tag-version`), commit, then push a `vx.y.z` tag. GitHub Actions builds the installer and creates the release with this section's text.

## [1.18.3] - 2026-10-16

### Fixed
- Synced lyrics show up again for YouTube videos: titles with featured artists ("ft. …"), channel names like "ArtistVEVO" and slightly different titles are now matched, picking the version whose length matches the song.
- Lyrics are retried when LRCLIB can't be reached, instead of staying off for the whole song.
- Lyrics stay in time: the song position now uses the moment the player reported it, and resuming after a pause no longer jumps ahead.
- The notch now tucks away behind two windows snapped side by side at the top of the screen, like it does behind a maximized window.

## [1.18.2] - 2026-10-15

### Fixed
- The right-click menu really stays open now when the mouse leaves the notch to reach an item: making the window click-through again closed Windows' menu, so the mouse tracking pauses while the menu is open.

## [1.18.1] - 2026-10-15

### Fixed
- The notch no longer closes (taking its right-click menu with it) when the mouse moves outside the notch to reach a menu item.

## [1.18.0] - 2026-10-15

### Added
- Focus mode: from a home tile or a right-click on the notch, pause the notch's activities for 1 hour, until tomorrow morning or until you turn it off. Timers, calendar reminders and low battery still show. A small icon in the notch reminds you it's on.
- Right-click on the notch opens a tools menu: screenshot, screen text, color picker, clipboard, focus mode, settings.
- Heat alert: the notch warns when the NVIDIA graphics card goes over 85 °C (or the processor over 95 °C, with Libre Hardware Monitor) and names the busiest app. Turn it off in Settings → Activities.
- Up to 12 home tiles (a third row), and a note explaining why the add buttons are disabled when Home is full.

### Fixed
- The tucked notch no longer pops out as soon as the mouse touches the top of the screen (when aiming at browser tabs): the mouse has to rest there a moment, following the hover delay setting.
- When it comes out, the notch no longer bounces away from the top of the screen, which left a gap.

## [1.17.0] - 2026-10-14

### Added
- Copy text from the screen: Ctrl+Alt+T freezes the screen under the mouse, you select an area and its text is copied. It is read offline by the OCR built into Windows, in your languages.
- Color picker: Ctrl+Alt+C shows a magnifier and copies the #hex color of the pixel you click (it then appears with its swatch in the clipboard history).
- Both are also available as home tiles, and both shortcuts can be changed in Settings → Behavior.
- Gestures on the collapsed notch: two-finger swipe (or Shift+wheel) for the next or previous song, middle click to play or pause.
- The mouse wheel on the notch can adjust the volume instead of opening it (Settings → Behavior → Mouse wheel on the notch).
- Pure black background for OLED screens, two more color styles (Neutral, Mono) and ready-made themes in Settings → Appearance.
- Settings backup: export your settings, tiles, tasks, favorites and pinned items to a file, and import them on another PC (Settings → About). AI keys are never exported.

### Changed
- The welcome tour now has three pages: the basics, the shortcuts, and features you might miss. After this update it shows its new pages once; replay it from Settings → About.
- New README pictures: the weather page, the clipboard history, the shortcuts and Follet's outfits.

### Fixed
- The mascot no longer overlaps the title in the welcome tour.

## [1.16.0] - 2026-10-14

### Added
- Follet's outfits: a witch hat all October, a Santa hat until Christmas, a party hat on New Year's, a striped toque when it snows or drops near freezing, an umbrella in the rain, sunglasses on hot sunny days. Turn them off in Settings → Appearance.
- Little reactions: Follet shivers below −5 °C, yawns now and then late at night, and laughs when you click it.

## [1.15.0] - 2026-10-14

### Added
- Several timers at once: the notch shows the one ending first (and how many run), Today lists them to switch between, and the clock-plus button adds another.
- Stopwatch (Today → Timer card → Stopwatch) with laps; while it runs alone, the notch shows it.

### Changed
- The README's privacy section mentions that pinned clipboard items are saved.

## [1.14.0] - 2026-10-14

### Added
- Ctrl+Alt+V (configurable in Settings → Behavior) opens the clipboard history: arrows to choose, Enter pastes into the app you were in, Shift+Enter only copies.
- Pinned clipboard items, kept across restarts (the rest of the history still stays in memory only).
- Copied images in the history (the last 8, in memory only).
- Links get an open button, colors (#hex) a swatch.

### Changed
- The clipboard is read only when Windows reports a change (clipboard sequence number from the helper), instead of every 0.7 s.

## [1.13.0] - 2026-10-14

### Added
- Detailed weather page, opened by clicking the weather card in Today: current conditions on a sky that follows the weather and the time of day, a 24-hour chart (temperature and chance of rain), 7 days, wind with direction and gusts, humidity, UV index, air quality, sunrise and sunset, pressure and visibility.
- Rain soon: the notch warns when rain or snow starts within the hour, from Open-Meteo's 15-minute forecast. Can be turned off in Settings → Activities.

## [1.12.0] - 2026-10-14

### Added
- Live downloads: while a browser downloads into the Downloads folder (Chrome, Edge, Brave, Firefox), the collapsed notch shows a chip with the size received so far; when it finishes, the file lands on the Shelf, ready to drag. Can be turned off in Settings → Activities.

## [1.11.0] - 2026-10-14

### Added
- Calendar reminders: the notch shows the event a few minutes before it starts (5, 10 or 15, set in Settings → Activities), then again when it starts.
- Uninstalling asks whether to also delete your Follet settings and data (`%APPDATA%\Follet`). Updates never touch them, and silent uninstalls keep them.

## [1.10.0] - 2026-10-14

### Added
- Screenshot to the Shelf: Ctrl+Alt+S (configurable in Settings → Behavior) captures the screen under the mouse at full resolution, without the notch, saves it to Pictures\Screenshots, copies it and drops it on the Shelf.
- Bluetooth devices: an activity when a headset, controller, mouse… connects or disconnects, with its battery, and an alert when it runs low. Connected devices and their battery also show on Home. Can be turned off in Settings → Activities.
- Configurable Home tiles (Settings → Tiles): reorder, remove, or add Follet shortcuts (screenshot to Shelf, lock, Notepad, Bluetooth devices…), any app or file, a folder or a website. Up to 8.

## [1.9.0] - 2026-10-14

### Added
- Synced lyrics: the current line shows in the preview (instead of the artist) and on Home, from [LRCLIB](https://lrclib.net), a free and open lyrics database. Video titles like "Artist - Song (Official Video)" are cleaned up before the lookup. Can be turned off in Settings → Activities.
- Notification history: Today → Notifications lists what is still in the Windows notification center, with a button to clear one or all of them (also from Windows).
- Pomodoro: 25 minutes of work and 5 minutes of break (15 every 4 sessions), chained automatically and shown in the notch.
- Clicking the album art (Home or preview) brings the player's window to the front.

### Changed
- Timer presets: 5, 10, 25 and 45 minutes, plus Pomodoro.

## [1.8.1] - 2026-10-13

### Changed
- Smaller installer: 95 MB instead of 111 MB (295 MB installed instead of 358 MB). Only the English and French Chromium languages are shipped, and development files of dependencies (source maps, TypeScript sources, unused icon styles) are left out.
- The README states Follet's footprint at rest.

## [1.8.0] - 2026-10-13

### Added
- Settings → Appearance: collapsed notch size (small, normal, large) and position (slide it anywhere along the top edge, for example over an off-center webcam; the button recenters it).
- Settings → Tabs: arrows to reorder the tabs in the bar.

## [1.7.0] - 2026-10-13

### Added
- Microphone indicator: an orange dot stays in the collapsed notch while an app is recording a microphone, and the notch briefly shows which app started. Detected from the active Windows audio capture sessions (the privacy registry Windows used to fill is no longer updated on recent builds). Can be turned off in Settings → Activities.

### Fixed
- An error was logged each time Follet quit, when the cursor tracker touched the already closed window.

## [1.6.1] - 2026-10-13

### Fixed
- Hardware acceleration is back on by default, including for installs that had it off since 1.5.0. Drawing the notch with the processor made animations less smooth and added heat while music played. It can still be turned off in Settings → Behavior to save ~70 MB.

## [1.6.0] - 2026-10-13

### Changed
- The Windows helper is rewritten in C#: a 33 KB exe using ~45 MB instead of ~110 MB for Windows PowerShell, faster answers, and commands no longer wait for each other. If it fails to start, Follet falls back to the PowerShell helper.
- Follet uses about 270 MB at rest, down from ~630 MB in 1.4.

### Added
- `scripts/helper-test.js`: helper protocol test, run on every push.

## [1.5.0] - 2026-10-13

### Changed
- About a third less memory at rest (~420 MB instead of ~630 MB for all processes).
- Claude Code usage is read incrementally, in a short-lived worker thread: the main process no longer keeps tens of MB after reading the logs.
- Hardware acceleration is off by default (the GPU process drops from ~90 MB to ~20 MB). Turn it back on in Settings → Behavior for smoother animations.
- The terminal (xterm) loads the first time its tab opens.
- The PowerShell helper reads the battery without loading WinForms.

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
