import { CHARACTERS, getSettings, isDnd, isBlacklisted, type Settings } from "./shared.js";

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

// Build a weighted deck by repeating each character index by its weight,
// then shuffling. e.g. weights [3,1,1] means the first character appears
// 3 out of 5 draws.
function rebuildDeck(weights: number[]): void {
    const expanded = CHARACTERS.flatMap((_, i) => Array(weights[i] || 1).fill(i));
    deck = shuffle(expanded);
}

function nextIndex(charMode: Settings["charMode"], weights: number[], singleIndex: number): number {
    if (charMode === "single") return singleIndex || 0;
    if (deck.length === 0) rebuildDeck(weights);
    return deck.pop()!;
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
    } catch {
        try {
            await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
            await chrome.tabs.sendMessage(tabId, message);
        } catch {
            // Page doesn't allow content scripts (e.g. chrome:// pages, the Web Store).
        }
    }
}

async function triggerPopup(): Promise<void> {
    const s = await getSettings();

    if (!s.enabled) return;
    if (isDnd(s.dndStart, s.dndEnd)) return;

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) return;
    if (isBlacklisted(tab.url, s.blacklist)) return;

    const index     = nextIndex(s.charMode, s.weights, s.singleIndex);
    const character = CHARACTERS[index]!;
    const imageUrl  = s.imageOverrides[index]
                        ? s.imageOverrides[index]!
                        : chrome.runtime.getURL(character.image);
    const soundUrl  = chrome.runtime.getURL(character.sound);
    const duration  = s.duration || 3000;
    const size      = Math.min(600, s.popupSize || 400);

    showPopupInTab(tab.id, imageUrl, duration, size);

    if (!s.mute) {
        if (chrome.offscreen) {
            // Chrome: play via an offscreen document (service workers have no audio).
            await ensureOffscreenDocument();
            chrome.runtime.sendMessage({ type: "play-sound-offscreen", sound: soundUrl });
        } else {
            // Firefox-style background pages have direct DOM access.
            new Audio(soundUrl).play().catch(() => {});
        }
    }

    scheduleNext(s);
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

getSettings().then(scheduleNext);

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "popup-alarm") triggerPopup();
});

chrome.storage.onChanged.addListener(() => {
    getSettings().then(scheduleNext);
});
