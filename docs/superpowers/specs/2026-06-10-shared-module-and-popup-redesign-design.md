# Shared Module, Background Migration & Popup Redesign

## Context

The extension has been partially migrated to TypeScript (`popup.ts`, `options.ts`,
`overlay.ts`, `offscreen.ts` exist alongside their compiled `.js` outputs).
`background.js` is still plain JS and not part of the TS build. `content.js`
exists but is not referenced by `manifest.json` (no `content_scripts` entry) —
it's dead code superseded by `background.ts` + `overlay.ts`.

There's an existing bug: `options.ts` reads/writes lowercase storage keys
(`intervalmode`, `intervalmin`, `intervalmax`, `popupsize`, `charmode`,
`singleindex`, `dndstart`, `dndend`) while `background.js` reads camelCase keys
(`intervalMode`, `intervalMin`, `intervalMax`, `popupSize`, `charMode`,
`singleIndex`, `dndStart`, `dndEnd`). Settings saved from Options are
effectively never read by the background script.

`options.ts` also has an unimplemented placeholder:
`declare function rendercharacters(...)`. There is no UI for choosing a
character in "single" mode, and no rendered character list at all.

## Goals

1. Centralize shared types, constants, and storage access into `shared.ts`,
   fixing the key-casing mismatch.
2. Migrate `background.js` → `background.ts`, using `shared.ts`.
3. Redesign the popup to be a quick-access control panel with name/credit.
4. Implement the character list UI in Options, including character selection
   for "single" mode.
5. Make audio playback portable to Firefox-style background pages (no
   manifest changes yet).
6. Remove dead code (`content.js`).

## 1. `shared.ts`

New file, imported by `background.ts`, `popup.ts`, `options.ts` (and
`overlay.ts`/`offscreen.ts` if useful).

Contents:

- `interface Character { name: string; image: string; sound: string }`
- `const CHARACTERS: Character[]` — canonical character list (mika, hoshino,
  izuna with their image/sound paths), replacing the duplicated `baDefaults`
  arrays in `background.js` and `content.js`.
- `interface Settings { ... }` — covers every stored field, all camelCase:
  `enabled`, `intervalMode`, `interval`, `intervalMin`, `intervalMax`,
  `duration`, `popupSize`, `charMode`, `imageOverrides`, `weights`,
  `singleIndex`, `mute`, `dndStart`, `dndEnd`, `blacklist`.
- `const DEFAULT_SETTINGS: Settings` — default values matching what the
  current code falls back to (`interval: 5000`, `intervalMin: 3000`,
  `intervalMax: 15000`, `duration: 3000`, `popupSize: 400`,
  `charMode: "shuffle"`, etc.)
- `function getSettings(): Promise<Settings>` — wraps
  `chrome.storage.local.get`, merges with `DEFAULT_SETTINGS` for any missing
  keys, returns a fully-typed `Settings` object.
- `function setSettings(partial: Partial<Settings>): Promise<void>` — wraps
  `chrome.storage.local.set`.
- `function isDnd(dndStart: string, dndEnd: string): boolean` — moved from
  `background.js`, unchanged logic.
- `function isBlacklisted(url: string, blacklist: string[]): boolean` —
  refactored from `background.js`'s `isBlacklisted` to take a URL string
  directly (so popup can reuse it without a `chrome.tabs` dependency baked
  in), using `startsWith` matching as before.

All storage key names live only in `shared.ts` (inside `getSettings`/
`setSettings`), so `options.ts`/`background.ts`/`popup.ts` never reference
raw string keys.

## 2. `background.ts`

- Rename `background.js` → `background.ts`, add to the TS build
  (`tsconfig.json` already compiles all `.ts` files in the root; verify
  `background.ts` is included).
- Update `manifest.json`: `"background": { "service_worker": "background.js",
  "type": "module" }` so the compiled output can use ES `import`.
- Import `CHARACTERS`, `Settings`, `getSettings`, `isDnd`, `isBlacklisted` from
  `./shared.js` (note: `.js` extension in the import specifier per
  `verbatimModuleSyntax`/ESM resolution, even though the source is `.ts`).
- `triggerPopup()`, `scheduleNext()`, `nextIndex()`, deck logic: keep current
  behavior, but use `getSettings()` instead of
  `chrome.storage.local.get([...string keys])`.
- `isBlacklisted` usage in background becomes:
  `isBlacklisted(tab.url, s.blacklist)` after fetching the active tab — the
  `chrome.tabs.query` call stays in `background.ts`.
- **Audio playback portability**: in `triggerPopup()`, replace the
  unconditional offscreen-document flow with:
  ```ts
  if (!s.mute) {
    if (chrome.offscreen) {
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({ type: "play-sound-offscreen", sound: soundUrl });
    } else {
      new Audio(soundUrl).play().catch(() => {});
    }
  }
  ```
  This keeps Chrome's existing offscreen-document path and adds a fallback
  for environments without `chrome.offscreen` (e.g. a Firefox background
  page, which has direct DOM/Audio access). No manifest changes for Firefox
  in this round.
- `chrome.storage.onChanged` listener and the initial `scheduleNext` call
  stay, just re-typed via `getSettings()`.

## 3. Popup (`popup.html` / `popup.ts`)

New layout:

```
BA Pop-up Interrupter
Made by arch2kx

[ ON/OFF ]   [ Mute: ☐ ]
[ Block this site / Unblock this site ]
[ More settings... ]
```

- **Header**: extension name + "Made by arch2kx" credit line.
- **On/off toggle**: existing button, now backed by `getSettings()`/
  `setSettings()`.
- **Mute toggle**: checkbox, `setSettings({ mute })` on change.
- **Block/Unblock this site button**:
  - On load, get the active tab's URL (`chrome.tabs.query({ active: true,
    lastFocusedWindow: true })`) and current `blacklist` via `getSettings()`.
  - Use `isBlacklisted(tab.url, blacklist)` to determine initial label
    ("Block this site" vs "Unblock this site").
  - On click: compute the tab's origin (`new URL(tab.url).origin`), add it to
    (or remove the matching entry from) `blacklist`, call `setSettings({
    blacklist })`, and toggle the button label.
- **More settings button**: calls `chrome.runtime.openOptionsPage()`.
- `style.css`: add minimal styles for the header/credit line and button
  group, consistent with existing visual style (no full redesign).

## 4. Options page (`options.ts` / `options.html`)

- Switch all storage access to `getSettings()`/`setSettings()` from
  `shared.ts`. Remove the lowercase key names entirely — this fixes the
  options/background key mismatch bug.
- Implement `rendercharacters(settings: Settings)` for real, replacing the
  `declare function` placeholder. For each entry in `CHARACTERS` (from
  `shared.ts`), render an `<li>` into `#character-list` containing:
  - Character name label
  - Image override text input (`data-url-index`), pre-filled from
    `settings.imageOverrides[i]` if present
  - Weight number input (`data-weight-index`), pre-filled from
    `settings.weights[i]`, visible only when `charMode === "weighted"`
  - A `name="singlechar"` radio button (value = index), checked if `i ===
    settings.singleIndex`, visible only when `charMode === "single"` — this
    is the new control letting the user pick which character appears in
    single mode.
- Extend the existing `updateintervalui`-style show/hide logic to also
  toggle the weight inputs vs. the single-character radios based on the
  selected `charMode`, re-rendering/toggling visibility when the radio
  selection changes (no full re-render needed — just show/hide the relevant
  per-character controls).
- Save handler: read `singlechar:checked` value into `singleIndex`, weights
  and image overrides as currently done, and call `setSettings({...})`.

## 5. Cleanup

- Delete `content.js` (and any stale `.js.map`/`.d.ts` if present) — it is
  not referenced in `manifest.json` and its functionality (popup overlay,
  sound playback, character shuffling) is fully covered by
  `background.ts` + `overlay.ts` + `offscreen.ts`.

## Out of scope (noted for later)

- Separate Firefox manifest (`manifest.firefox.json`,
  `browser_specific_settings`, `background.scripts`) and dual-build setup.
- Any visual redesign beyond the popup layout changes described above.
