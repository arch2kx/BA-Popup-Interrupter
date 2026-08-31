export interface Character {
    name: string;
    image: string;
    sound: string;
    // Per-character loudness equalization, measured at build time. Always
    // <= 1, because HTMLMediaElement.volume can only attenuate.
    gain: number;
}

// characters.json is generated from the files on disk by
// scripts/gen-characters.mjs (npm run gen:characters). Don't edit it by hand —
// drop an image in images/actual-popup/ and a matching sound in sounds/, then
// rebuild.
let charactersPromise: Promise<Character[]> | null = null;

export function getCharacters(): Promise<Character[]> {
    if (!charactersPromise) {
        charactersPromise = fetch(chrome.runtime.getURL("characters.json"))
            .then(res => res.json() as Promise<Character[]>)
            .catch((err) => {
                console.error("failed to load characters.json", err);
                charactersPromise = null;   // let the next call retry
                return [];
            });
    }
    return charactersPromise;
}

export interface Settings {
    enabled: boolean;
    intervalMode: "fixed" | "random";
    interval: number;
    intervalMin: number;
    intervalMax: number;
    duration: number;
    popupSize: number;
    charMode: "shuffle" | "weighted" | "single";
    imageOverrides: string[];
    weights: number[];
    singleIndex: number;
    mute: boolean;
    volume: number;
    dndStart: string;
    dndEnd: string;
    blacklist: string[];
}

export const DEFAULT_SETTINGS: Settings = {
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
function isValidOrigin(entry: string): boolean {
    try {
        const { protocol, origin } = new URL(entry);
        return (protocol === "http:" || protocol === "https:") && origin !== "null";
    } catch {
        return false;
    }
}

export function getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>, (res) => {
            const settings = res as unknown as Settings;
            settings.blacklist = settings.blacklist.filter(isValidOrigin);
            resolve(settings);
        });
    });
}

export function setSettings(partial: Partial<Settings>): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set(partial, () => resolve());
    });
}

// Returns true if the current time falls inside the do-not-disturb window.
// Handles overnight ranges, e.g. 22:00 to 06:00.
export function isDnd(dndStart: string, dndEnd: string): boolean {
    if (!dndStart || !dndEnd) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = dndStart.split(":").map(Number);
    const [eh, em] = dndEnd.split(":").map(Number);
    const start = (sh ?? 0) * 60 + (sm ?? 0);
    const end   = (eh ?? 0) * 60 + (em ?? 0);
    return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

// Returns true if the given URL starts with any blacklisted entry.
export function isBlacklisted(url: string, blacklist: string[]): boolean {
    if (!url || !blacklist || blacklist.length === 0) return false;
    return blacklist.some(entry => url.startsWith(entry));
}
