const baDefaults = [
    { image: "images/mika.png",    sound: "sounds/mika-ok.mp3" },
    { image: "images/hoshino.png", sound: "sounds/hoshino-uhee.mp3" },
    { image: "images/izuna.png",   sound: "sounds/izuna-nin-nin.mp3" }
];

// Fisher-Yates shuffle — see content.js for explanation.
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

let deck = shuffle(baDefaults);

function nextCharacter(overrides) {
    if (deck.length === 0) deck = shuffle(baDefaults);
    const character = deck.pop();
    const index = baDefaults.indexOf(character);
    return {
        image: (overrides && overrides[index]) ? overrides[index] : chrome.runtime.getURL(character.image),
        sound: chrome.runtime.getURL(character.sound)
    };
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

// Opens a frameless popup window showing the character image.
// The overlay closes itself after 3 seconds.
async function triggerPopup() {
    const { enabled, interval, imageOverrides } = await chrome.storage.local.get(["enabled", "interval", "imageOverrides"]);
    if (!enabled) return;

    const character = nextCharacter(imageOverrides);

    // Pass the image URL to the overlay via the query string so it knows
    // what to display without needing a separate message round-trip.
    const overlayUrl = chrome.runtime.getURL("overlay.html")
        + "?image=" + encodeURIComponent(character.image);

    chrome.windows.create({
        url: overlayUrl,
        type: "popup",
        width: 220,
        height: 220,
        focused: false
    });

    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({ type: "play-sound-offscreen", sound: character.sound });
}

// Use an alarm instead of setInterval — service workers can be suspended
// by the browser between events and setInterval would stop firing.
// Alarms wake the service worker up reliably on schedule.
chrome.alarms.create("popup-alarm", { periodInMinutes: 1 / 12 }); // every 5 seconds default

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "popup-alarm") triggerPopup();
});

// Recreate the alarm with the new interval when settings change.
chrome.storage.onChanged.addListener((changes) => {
    if (changes.interval) {
        const minutes = changes.interval.newValue / 60000;
        chrome.alarms.create("popup-alarm", { periodInMinutes: minutes });
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "play-sound") return;
    ensureOffscreenDocument().then(() => {
        chrome.runtime.sendMessage({ type: "play-sound-offscreen", sound: message.sound });
    });
});
