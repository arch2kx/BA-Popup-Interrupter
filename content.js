const baDefaults = [
  {
    image: chrome.runtime.getURL("images/mika.png"),
    sound: chrome.runtime.getURL("sounds/mika-ok.mp3")
  },
  {
    image: chrome.runtime.getURL("images/hoshino.png"),
    sound: chrome.runtime.getURL("sounds/hoshino-uhee.mp3")
  },
  {
    image: chrome.runtime.getURL("images/izuna.png"),
    sound: chrome.runtime.getURL("sounds/izuna-nin-nin.mp3")
  }
];

// baCharacters is what popup() actually uses. applyOverrides() merges
// any saved custom image URLs on top of the defaults.
let baCharacters = [...baDefaults];

function applyOverrides(overrides) {
    baCharacters = baDefaults.map((c, i) =>
        overrides[i] ? { ...c, image: overrides[i] } : c
    );
    deck = shuffle(baCharacters);
}

let enabled = false;
let isPopupVisible = false;

// Shuffle produces a randomised copy of the array.
// It works by iterating backwards through the array and swapping each
// element with a random earlier element (Fisher-Yates algorithm).
// This guarantees every character appears once before any repeats.

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Deck is our shuffled queue. When it empties we reshuffle.
let deck = shuffle(baCharacters);

function nextCharacter() {
    if (deck.length === 0) deck = shuffle(baCharacters);
    return deck.pop();
}
const host = document.createElement("div");
host.setAttribute("data-ba-popup", "true");
const shadow = host.attachShadow({ mode: "open" });

const style = document.createElement("style");
style.textContent = `
  img {
    position: fixed;
    bottom: 50px;
    right: 50px;
    width: 800px;
    z-index: 2147483647;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }
  img.visible {
    opacity: 1;
  }
`;
shadow.appendChild(style);

const img = document.createElement("img");
shadow.appendChild(img);

// attachShadow works on detached elements, so we create and configure
// the shadow root first, then append the host once the body is ready.
function attachHost() {
    (document.body || document.documentElement).appendChild(host);
}

function popup() {
    if (!enabled || isPopupVisible) return;

    const character = nextCharacter();
    isPopupVisible = true;

    img.src = character.image;

    // Toggling the class on the next animation frame gives the browser
    // time to register the element before the transition starts.
    // Without this the fade-in does not play — the browser would collapse
    // the opacity-0 and opacity-1 states into a single paint.
    requestAnimationFrame(() => {
        img.classList.add("visible");
    });

    try {
        chrome.runtime.sendMessage({ type: "play-sound", sound: character.sound });
    } catch (_) {
        // Extension context invalidated (e.g. extension was reloaded).
        // Fail silently rather than throwing an uncaught error.
    }

    // Fade out after 3 seconds, then mark popup as gone.
    setTimeout(() => {
        img.classList.remove("visible");

        // Wait for the CSS transition to finish (300ms) before allowing
        // the next popup. If we didn't wait, isPopupVisible would clear
        // while the image was still mid-fade.
        setTimeout(() => {
            isPopupVisible = false;
        }, 300);
    }, 3000);
}

let intervalTime = 5000;
let intervalId = null;

function startInterval() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(popup, intervalTime);
}

chrome.storage.local.get(["enabled", "interval", "imageOverrides"], (res) => {
    enabled = res.enabled || false;
    if (res.interval) intervalTime = res.interval;
    if (res.imageOverrides) applyOverrides(res.imageOverrides);
    attachHost();
    startInterval();
});

// storage.onChanged fires whenever any value in storage changes,
// in any tab or context. We only act on the keys we care about.
chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
        enabled = changes.enabled.newValue;
    }
    if (changes.interval) {
        intervalTime = changes.interval.newValue;
        startInterval();
    }
    if (changes.imageOverrides) {
        applyOverrides(changes.imageOverrides.newValue);
    }
});
