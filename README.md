# BA Pop-Up Interrupter

A browser extension that periodically interrupts you with a pop-up (and sound) of a Blue Archive character. Fully configurable, works on Chrome and Firefox.

## Features

- **Timed interruptions** give fixed interval or a random range, up to user
- **Character selection** includes shuffled deck (no repeats until the deck runs out), weighted odds per character, or lock it to a single character
- **Per-character volume equalization** makes clips loudness-matched at build time so no character is jarringly louder than the rest
- **Do Not Disturb window** silences popups during a set time range
- **Per-site blocking** — block the current site from the popup, or maintain a URL blacklist in settings
- **Mute toggle, custom popup size/duration, custom image overrides** per character

## Installation

The extension should be in Chrome Web Store / Firefox Addons if they are (or are not.)

### From Source (Unpacked)

1. Clone the repo and install dependencies:
   ```sh
   git clone https://github.com/arch2kx/BA-Popup-Interrupter.git
   cd BA-Popup-Interrupter
   npm install
   npm run build
   ```
2. **Chrome/Edge:** go to `chrome://extensions`, enable Developer mode, click "Load unpacked", and select the repo folder.
3. **Firefox:** go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json`.

## Development

```sh
npm run build   # regenerates characters.json from images/sounds, then compiles TypeScript
```

Adding a character is just dropping in a matching image and sound file, for more information see the convention documented at the top of [`scripts/gen-characters.mjs`](scripts/gen-characters.mjs):

```
images/actual-popup/<name>.png
sounds/<name>.mp3  (or sounds/<name>-<anything>.mp3)
```

The build fails loudly if a name is missing its pair, instead of silently dropping it from the roster.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Persist your settings (interval, characters, blacklist, etc.) |
| `alarms` | Schedule the next popup without keeping the service worker alive |
| `tabs` | Read the active tab's URL to check it against the DND/blacklist rules |
| `scripting` | Inject the popup overlay into tabs that were already open before the extension loaded |
| `offscreen` | Play sound from the Chrome service worker, which has no direct audio access |
| `<all_urls>` content script | Renders the popup overlay on the page you're currently viewing |

No data ever leaves your browser, this is only local to `chrome.storage`.

## Credits

Made by [arch2kx](https://github.com/arch2kx). Character art and audio are property of Nexon Games / Yostar. Note that this is an unofficial fan project.

## License

[MIT](LICENSE)
