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

// Returns true if the active tab's URL is blacklisted.
async function isActiveTabBlacklisted(blacklist: string[]): Promise<boolean> {
    if (!blacklist || blacklist.length === 0) return false;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) return false;
    return isBlacklisted(tab.url, blacklist);
}

async function triggerPopup(): Promise<void> {
    const s = await getSettings();

    if (!s.enabled) return;
    if (isDnd(s.dndStart, s.dndEnd)) return;
    if (await isActiveTabBlacklisted(s.blacklist)) return;

    const index     = nextIndex(s.charMode, s.weights, s.singleIndex);
    const character = CHARACTERS[index]!;
    const imageUrl  = s.imageOverrides[index]
                        ? s.imageOverrides[index]!
                        : chrome.runtime.getURL(character.image);
    const soundUrl  = chrome.runtime.getURL(character.sound);
    const duration  = s.duration || 3000;
    const size      = Math.min(800, s.popupSize || 400);

    const overlayUrl = chrome.runtime.getURL("overlay.html")
        + "?image="    + encodeURIComponent(imageUrl)
        + "&duration=" + duration;

    chrome.windows.create({
        url: overlayUrl,
        type: "popup",
        width: size,
        height: size,
        focused: false
    });

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
    chrome.alarms.create("popup-alarm", { delayInMinutes: ms / 60000 });
}

getSettings().then(scheduleNext);

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "popup-alarm") triggerPopup();
});

chrome.storage.onChanged.addListener(() => {
    getSettings().then(scheduleNext);
});
