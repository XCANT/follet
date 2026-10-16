# Accessibility

Follet should be usable by as many people as possible. This page says honestly what works today, what doesn't, and how to tell us about a barrier.

## Supported

- Windows 10 and 11, mouse, touchpad or keyboard.
- **Keyboard**: `Ctrl+Alt+Space` opens or closes the notch from anywhere. Once it is open, `1`–`9` pick a tab, the left and right arrows move between tabs and `Esc` closes it. The screen tools also have shortcuts (`Ctrl+Alt+S` screenshot, `Ctrl+Alt+T` screen text, `Ctrl+Alt+C` color picker, `Ctrl+Alt+V` clipboard), all changeable in Settings.
- **Hover speed**: Settings → Behavior lets you slow down or speed up how long the mouse has to rest before the notch opens or comes out.
- **Contrast and themes**: colors follow Material 3 with an automatic or fixed theme, plus a pure black background.
- **Notch size**: small, normal or large in Settings.
- **Language**: English and French, following Windows or chosen in Settings.

## Known limitations

- Screen readers (Narrator, NVDA) have not been tested. Most buttons are icons without accessible labels yet.
- The notch is built around the mouse: hovering, scrolling and gestures. Not every control inside the tabs can be reached with `Tab` yet.
- Animations (the Follet mascot, the notch opening) do not follow Windows' "Animation effects" setting yet.
- Text size is fixed and does not follow Windows' text scaling setting.

## Report a barrier

Open an [issue](https://github.com/XCANT/follet/issues/new/choose) describing what you tried, what got in the way, and the assistive technology you use if any. Accessibility issues are treated as bugs.
