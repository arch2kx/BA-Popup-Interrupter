import { getCharacters, getSettings, isDnd, isBlacklisted } from "./shared.js";
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}
let deck = [];
// Build a weighted deck by repeating each character index by its weight,
// then shuffling. e.g. weights [3,1,1] means the first character appears
// 3 out of 5 draws.
function rebuildDeck(characters, weights) {
    const expanded = characters.flatMap((_, i) => Array(weights[i] || 1).fill(i));
    deck = shuffle(expanded);
}
function nextIndex(characters, charMode, weights, singleIndex) {
    if (charMode === "single")
        return singleIndex || 0;
    if (deck.length === 0)
        rebuildDeck(characters, weights);
    return deck.pop();
}
// Firefox fallback: cache one Audio element per sound file and reuse it,
// instead of constructing a fresh one on every trigger. Also lets us
// actually preload the sound instead of starting a network fetch from zero
// each time the alarm fires.
const audioCache = new Map();
function getCachedAudio(soundUrl) {
    let audio = audioCache.get(soundUrl);
    if (!audio) {
        audio = new Audio(soundUrl);
        audio.preload = "auto";
        audioCache.set(soundUrl, audio);
    }
    return audio;
}
function playSound(soundUrl, volume) {
    const audio = getCachedAudio(soundUrl);
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => { });
}
async function ensureOffscreenDocument() {
    const existing = await chrome.offscreen.hasDocument();
    if (existing)
        return;
    await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen.html"),
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play character sounds without autoplay restrictions"
    });
}
// Tabs that were already open before content.js was registered (e.g. before
// the extension was installed/reloaded) won't have the content script
// injected yet, so the message goes nowhere. Inject it on demand and retry.
async function showPopupInTab(tabId, image, duration, size) {
    const message = { type: "show-popup", image, duration, size };
    try {
        await chrome.tabs.sendMessage(tabId, message);
    }
    catch (firstErr) {
        try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
            await chrome.tabs.sendMessage(tabId, message);
        }
        catch (secondErr) {
            // DEBUG: temporary logging to find the "sound plays, no popup" cause.
            // Page doesn't allow content scripts (e.g. chrome:// pages, the Web Store)
            // is the expected case; anything else here is the actual bug.
            console.warn("[BA popup] showPopupInTab failed", { tabId, firstErr, secondErr });
        }
    }
}
// Every reason to skip a popup lives in here, so it can return early freely.
// Keeping the reschedule out of this function is what makes the alarm chain
// impossible to break by adding another skip condition later.
async function maybeShowPopup(s) {
    if (isDnd(s.dndStart, s.dndEnd))
        return;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url)
        return;
    if (isBlacklisted(tab.url, s.blacklist))
        return;
    const characters = await getCharacters();
    if (characters.length === 0)
        return; // bad or missing characters.json
    const index = nextIndex(characters, s.charMode, s.weights, s.singleIndex);
    const character = characters[index];
    if (!character)
        return; // singleIndex past a shrunken roster
    const imageUrl = s.imageOverrides[index]
        ? s.imageOverrides[index]
        : chrome.runtime.getURL(character.image);
    const soundUrl = chrome.runtime.getURL(character.sound);
    const duration = s.duration || 3000;
    const size = Math.min(600, s.popupSize || 400);
    showPopupInTab(tab.id, imageUrl, duration, size);
    if (!s.mute) {
        // User volume scaled by the character's equalization gain, clamped
        // because HTMLMediaElement.volume throws outside 0..1.
        const volume = Math.min(1, Math.max(0, (s.volume ?? 1) * (character.gain ?? 1)));
        if (chrome.offscreen) {
            // Chrome: play via an offscreen document (service workers have no audio).
            await ensureOffscreenDocument();
            chrome.runtime.sendMessage({ type: "play-sound-offscreen", sound: soundUrl, volume });
        }
        else {
            // Firefox-style background pages have direct DOM access.
            playSound(soundUrl, volume);
        }
    }
}
async function triggerPopup() {
    const s = await getSettings();
    // "Disabled" is the one skip that deliberately does NOT reschedule:
    // rescheduling would wake the service worker forever to do nothing.
    // Re-enabling writes to storage, and the onChanged listener below
    // restarts the chain.
    if (!s.enabled)
        return;
    try {
        await maybeShowPopup(s);
    }
    finally {
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
function scheduleNext(s) {
    let ms;
    if (s.intervalMode === "random") {
        const min = s.intervalMin || 3000;
        const max = s.intervalMax || 15000;
        ms = Math.random() * (max - min) + min;
    }
    else {
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
function resyncAlarm() {
    getSettings().then((s) => {
        if (s.enabled)
            scheduleNext(s);
        else
            chrome.alarms.clear("popup-alarm");
    });
}
resyncAlarm();
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "popup-alarm")
        return;
    // triggerPopup's finally has already rescheduled by the time this can
    // reject, so catching here only keeps it out of the unhandled-rejection log.
    triggerPopup().catch(err => console.error("popup trigger failed", err));
});
chrome.storage.onChanged.addListener(resyncAlarm);
//# sourceMappingURL=background.js.map