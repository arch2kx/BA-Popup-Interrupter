export interface Character {
    name: string;
    image: string;
    sound: string;
}

export const CHARACTERS: Character[] = [
    { name: "mika",    image: "images/mika.png",    sound: "sounds/mika-ok.mp3" },
    { name: "hoshino", image: "images/hoshino.png", sound: "sounds/hoshino-uhee.mp3" },
    { name: "izuna",   image: "images/izuna.png",   sound: "sounds/izuna-nin-nin.mp3" }
];

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
    weights: [1, 1, 1],
    singleIndex: 0,
    mute: false,
    dndStart: "",
    dndEnd: "",
    blacklist: []
};

// chrome.storage.local.get accepts an object of defaults: any key missing
// from storage is filled in from this object in the result.
export function getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>, (res) => {
            resolve(res as unknown as Settings);
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
