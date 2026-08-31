// characters.json is generated from the files on disk by
// scripts/gen-characters.mjs (npm run gen:characters). Don't edit it by hand —
// drop an image in images/actual-popup/ and a matching sound in sounds/, then
// rebuild.
let charactersPromise = null;
export function getCharacters() {
    if (!charactersPromise) {
        charactersPromise = fetch(chrome.runtime.getURL("characters.json"))
            .then(res => res.json())
            .catch((err) => {
            console.error("failed to load characters.json", err);
            charactersPromise = null; // let the next call retry
            return [];
        });
    }
    return charactersPromise;
}
export const DEFAULT_SETTINGS = {
    enabled: false,
    intervalMode: "fixed",
    interval: 5000,
    intervalMin: 3000,
    intervalMax: 15000,
    duration: 3000,
    popupSize: 400,
    charMode: "shuffle",
    imageOverrides: [],
    // Left empty on purpose: both consumers fall back to 1 for a missing
    // index, so this stays correct no matter how many characters exist.
    weights: [],
    singleIndex: 0,
    mute: false,
    volume: 1,
    dndStart: "",
    dndEnd: "",
    blacklist: []
};
// chrome.storage.local.get accepts an object of defaults: any key missing
// from storage is filled in from this object in the result.
function isValidOrigin(entry) {
    try {
        const { protocol, origin } = new URL(entry);
        return (protocol === "http:" || protocol === "https:") && origin !== "null";
    }
    catch {
        return false;
    }
}
export function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_SETTINGS, (res) => {
            const settings = res;
            settings.blacklist = settings.blacklist.filter(isValidOrigin);
            resolve(settings);
        });
    });
}
export function setSettings(partial) {
    return new Promise((resolve) => {
        chrome.storage.local.set(partial, () => resolve());
    });
}
// Returns true if the current time falls inside the do-not-disturb window.
// Handles overnight ranges, e.g. 22:00 to 06:00.
export function isDnd(dndStart, dndEnd) {
    if (!dndStart || !dndEnd)
        return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = dndStart.split(":").map(Number);
    const [eh, em] = dndEnd.split(":").map(Number);
    const start = (sh ?? 0) * 60 + (sm ?? 0);
    const end = (eh ?? 0) * 60 + (em ?? 0);
    return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}
// Returns true if the given URL starts with any blacklisted entry.
export function isBlacklisted(url, blacklist) {
    if (!url || !blacklist || blacklist.length === 0)
        return false;
    return blacklist.some(entry => url.startsWith(entry));
}
//# sourceMappingURL=shared.js.map