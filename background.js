const baDefaults = [
    { image: "images/mika.png",    sound: "sounds/mika-ok.mp3" },
    { image: "images/hoshino.png", sound: "sounds/hoshino-uhee.mp3" },
    { image: "images/izuna.png",   sound: "sounds/izuna-nin-nin.mp3" }
];

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

let deck = [];

// Build a weighted deck by repeating each character index by its weight,
// then shuffling. e.g. weights [3,1,1] means Mika appears 3 out of 5 draws.
function rebuildDeck(weights) {
    const expanded = baDefaults.flatMap((_, i) => Array(weights[i] || 1).fill(i));
    deck = shuffle(expanded);
}

function nextIndex(charMode, weights, singleIndex) {
    if (charMode === "single") return singleIndex || 0;
    if (deck.length === 0) rebuildDeck(weights || [1, 1, 1]);
    return deck.pop();
}

async function ensureOffscreenDocument() {
    const existing = await chrome.offscreen.hasDocument();
    if (existing) return;
    await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL("offscreen.html"),
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play character sounds without autoplay restrictions"
    });
}

// Returns true if current time is inside the do-not-disturb window.
// Handles overnight ranges e.g. 22:00 to 06:00.
function isDnd(dndStart, dndEnd) {
    if (!dndStart || !dndEnd) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = dndStart.split(":").map(Number);
    const [eh, em] = dndEnd.split(":").map(Number);
    const start = sh * 60 + sm;
    const end   = eh * 60 + em;
    return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

// Returns true if the active tab URL starts with any blacklisted entry.
async function isBlacklisted(blacklist) {
    if (!blacklist || blacklist.length === 0) return false;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) return false;
    return blacklist.some(entry => tab.url.startsWith(entry));
}

async function triggerPopup() {
    const s = await chrome.storage.local.get([
        "enabled", "intervalMode", "interval", "intervalMin", "intervalMax",
        "duration", "popupSize",
        "charMode", "imageOverrides", "weights", "singleIndex",
        "mute", "dndStart", "dndEnd", "blacklist"
    ]);

    if (!s.enabled) return;
    if (isDnd(s.dndStart, s.dndEnd)) return;
    if (await isBlacklisted(s.blacklist)) return;

    const index     = nextIndex(s.charMode, s.weights, s.singleIndex);
    const character = baDefaults[index];
    const imageUrl  = (s.imageOverrides && s.imageOverrides[index])
                        ? s.imageOverrides[index]
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
        await ensureOffscreenDocument();
        chrome.runtime.sendMessage({ type: "play-sound-offscreen", sound: soundUrl });
    }

    scheduleNext(s);
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
    } else {
        ms = s.interval || 5000;
    }
    chrome.alarms.create("popup-alarm", { delayInMinutes: ms / 60000 });
}

chrome.storage.local.get([
    "intervalMode", "interval", "intervalMin", "intervalMax"
], (res) => scheduleNext(res));

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "popup-alarm") triggerPopup();
});

chrome.storage.onChanged.addListener(() => {
    chrome.storage.local.get([
        "intervalMode", "interval", "intervalMin", "intervalMax"
    ], (res) => scheduleNext(res));
});
