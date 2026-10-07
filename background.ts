import { assetUrl, getAllCharacters, getSettings, isDnd, isBlacklisted, type Character, type Settings } from "./shared.js";

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i]!;
        a[i] = a[j]!;
        a[j] = tmp;
    }
    return a;
}

let deck: number[] = [];
let deckKey = "";

// Build a weighted deck by repeating each character index by its weight,
// then shuffling. e.g. with three characters weighted 3, 1 and 1, the first
// one appears 3 out of 5 draws.
function rebuildDeck(characters: Character[], weights: Settings["weights"]): void {
    const expanded = characters.flatMap((c, i) => Array(weights[c.name] || 1).fill(i));
    deck = shuffle(expanded);
}

function nextIndex(characters: Character[], s: Pick<Settings, "charMode" | "weights" | "singleName">): number {
    if (s.charMode === "single") {
        // findIndex returns -1 for a name that is unset or no longer in the
        // roster, which falls back to the first character.
        return Math.max(0, characters.findIndex(c => c.name === s.singleName));
    }
    // The deck holds positions in `characters`, so it is thrown away whenever
    // the roster or the weights change (e.g. a custom student was removed),
    // instead of dealing out positions that no longer mean the same thing.
    const key = JSON.stringify(characters.map(c => [c.name, s.weights[c.name] || 1]));
    if (deck.length === 0 || key !== deckKey) {
        rebuildDeck(characters, s.weights);
        deckKey = key;
    }
    return deck.pop()!;
}

interface Clip {
    sound: string;
    volume: number;
}

// Firefox fallback: cache one Audio element per sound file and reuse it,
// instead of constructing a fresh one on every trigger. Also lets us
// actually preload the sound instead of starting a network fetch from zero
// each time the alarm fires.
const audioCache = new Map<string, HTMLAudioElement>();

function getCachedAudio(soundUrl: string): HTMLAudioElement {
    let audio = audioCache.get(soundUrl);
    if (!audio) {
        audio = new Audio(soundUrl);
        audio.preload = "auto";
        audioCache.set(soundUrl, audio);
    }
    return audio;
}

// play() rejects when the clip can't be loaded (dead link, unsupported
// format), which is what triggers the fallback.
function playSound(clip: Clip, fallback?: Clip): void {
    const audio = getCachedAudio(clip.sound);
    audio.currentTime = 0;
    audio.volume = clip.volume;
    audio.play().catch(() => {
        audioCache.delete(clip.sound);
        if (fallback) playSound(fallback);
    });
}

async function ensureOffscreenDocument(): Promise<void> {
    const existing = await chrome.offscreen.hasDocument();
    if (existing) return;
    await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen.html"),
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play character sounds without autoplay restrictions"
    });
}

// Tabs that were already open before content.js was registered (e.g. before
// the extension was installed/reloaded) won't have the content script
// injected yet, so the message goes nowhere. Inject it on demand and retry.
async function showPopupInTab(tabId: number, image: string, duration: number, size: number): Promise<void> {
    const message = { type: "show-popup", image, duration, size };

    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (firstErr) {
        try {
            await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
            await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
            await chrome.tabs.sendMessage(tabId, message);
        } catch (secondErr) {
            // Page doesn't allow content scripts (chrome:// pages, the Web Store)
            // is the expected case; anything else here is a real failure.
            console.warn("[BA popup] showPopupInTab failed", { tabId, firstErr, secondErr });
        }
    }
}

// Every reason to skip a popup lives in here, so it can return early freely.
// Keeping the reschedule out of this function is what makes the alarm chain
// impossible to break by adding another skip condition later.
async function maybeShowPopup(s: Settings): Promise<void> {
    if (isDnd(s.dndStart, s.dndEnd)) return;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) return;
    if (isBlacklisted(tab.url, s.blacklist)) return;

    const characters = await getAllCharacters(s);
    if (characters.length === 0) return;   // bad or missing characters.json

    const character = characters[nextIndex(characters, s)];
    if (!character) return;

    const imageUrl  = s.imageOverrides[character.name] || assetUrl(character.image);
    const duration  = s.duration || 3000;
    const size      = Math.min(600, s.popupSize || 400);

    showPopupInTab(tab.id, imageUrl, duration, size);

    if (!s.mute) {
        // Clamped because HTMLMediaElement.volume throws outside 0..1.
        const clamp = (v: number): number => Math.min(1, Math.max(0, v));
        const userVolume = s.volume ?? 1;

        // User volume scaled by the character's equalization gain.
        const builtin: Clip = {
            sound: assetUrl(character.sound),
            volume: clamp(userVolume * (character.gain ?? 1))
        };

        // A custom clip has no measured gain, so it plays at the plain user
        // volume. If it fails to load, the built-in sound plays instead.
        const customUrl = s.audioOverrides[character.name];
        const primary: Clip = customUrl ? { sound: customUrl, volume: clamp(userVolume) } : builtin;
        const fallback = customUrl ? builtin : undefined;

        if (chrome.offscreen) {
            // Chrome: play via an offscreen document (service workers have no audio).
            await ensureOffscreenDocument();
            chrome.runtime.sendMessage({ type: "play-sound-offscreen", ...primary, fallback });
        } else {
            // Firefox-style background pages have direct DOM access.
            playSound(primary, fallback);
        }
    }
}

async function triggerPopup(): Promise<void> {
    const s = await getSettings();

    // "Disabled" is the one skip that deliberately does NOT reschedule:
    // rescheduling would wake the service worker forever to do nothing.
    // Re-enabling writes to storage, and the onChanged listener below
    // restarts the chain.
    if (!s.enabled) return;

    try {
        await maybeShowPopup(s);
    } finally {
        // Every other skip — DND, no tab, blacklisted site, bad roster — is
        // transient and produces no storage write when it clears. Nothing
        // else would ever restart the chain, so it has to keep itself alive.
        // finally also covers an unexpected throw from the chrome APIs.
        scheduleNext(s);
    }
}

// For random mode, pick a fresh random delay each time.
// For fixed mode, use the saved interval.
// delayInMinutes is used instead of periodInMinutes so each trigger
// schedules the next one, allowing the delay to vary each time.
function scheduleNext(s: Pick<Settings, "intervalMode" | "interval" | "intervalMin" | "intervalMax">): void {
    let ms: number;
    if (s.intervalMode === "random") {
        const min = s.intervalMin || 3000;
        const max = s.intervalMax || 15000;
        ms = Math.random() * (max - min) + min;
    } else {
        ms = s.interval || 5000;
    }
    // Floor at 1s: chrome.alarms has no minimum delay for unpacked extensions,
    // so a tiny/zero interval would otherwise refire near-instantly and flood
    // the screen with popup windows.
    ms = Math.max(ms, 1000);
    chrome.alarms.create("popup-alarm", { delayInMinutes: ms / 60000 });
}

// Re-arms the chain from stored settings. Clears the alarm when disabled so
// the service worker stops waking at all, rather than waking only to find
// !enabled and bail.
function resyncAlarm(): void {
    getSettings().then((s) => {
        if (s.enabled) scheduleNext(s);
        else chrome.alarms.clear("popup-alarm");
    });
}

resyncAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "popup-alarm") return;
    // triggerPopup's finally has already rescheduled by the time this can
    // reject, so catching here only keeps it out of the unhandled-rejection log.
    triggerPopup().catch(err => console.error("popup trigger failed", err));
});

chrome.storage.onChanged.addListener(resyncAlarm);
