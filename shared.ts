export interface Character {
    name: string;
    academy: string;
    image: string;
    sound: string;
    // Per-character loudness equalization, measured at build time. Always
    // <= 1, because HTMLMediaElement.volume can only attenuate.
    gain: number;
    // True for students the user added in settings. Their image and sound are
    // full URLs (http or data:) instead of paths inside the extension.
    custom?: boolean;
}

export interface CustomCharacter {
    name: string;
    academy: string;
    image: string;
    sound: string;
    // Volume multiplier from 0 to 1, set by hand because a custom clip can't
    // be measured at build time. Missing means 1.
    gain?: number;
}

export function assetUrl(path: string): string {
    return /^(https?:\/\/|data:)/i.test(path) ? path : chrome.runtime.getURL(path);
}

// characters.json is generated from the files on disk by
// scripts/gen-characters.mjs (npm run gen:characters). Don't edit it by hand —
// drop an image in images/actual-popup/ and a matching sound in sounds/, add
// the name to scripts/academies.json, then rebuild.
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

// Built-in characters followed by the user's custom students. A custom student
// whose name a later release ships as a built-in is dropped in favour of the
// built-in one.
export async function getAllCharacters(settings: Pick<Settings, "customCharacters">): Promise<Character[]> {
    const builtin = await getCharacters();
    const taken = new Set(builtin.map(c => c.name));
    const custom = settings.customCharacters
        .filter(c => !taken.has(c.name))
        .map(c => ({ ...c, gain: c.gain ?? 1, custom: true }));
    return [...builtin, ...custom];
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
    // Per-character settings are keyed by character name, not by position in
    // characters.json, so adding, removing or reordering characters can never
    // point a saved setting at the wrong character.
    imageOverrides: Record<string, string>;
    audioOverrides: Record<string, string>;
    weights: Record<string, number>;
    singleName: string;
    customCharacters: CustomCharacter[];
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
    imageOverrides: {},
    audioOverrides: {},
    // Left empty on purpose: both consumers fall back to 1 for a missing
    // name, so this stays correct no matter how many characters exist.
    weights: {},
    singleName: "",
    customCharacters: [],
    mute: false,
    volume: 1,
    dndStart: "",
    dndEnd: "",
    blacklist: []
};

function isValidOrigin(entry: string): boolean {
    try {
        const { protocol, origin } = new URL(entry);
        return (protocol === "http:" || protocol === "https:") && origin !== "null";
    } catch {
        return false;
    }
}

// Releases up to 1.0.3 stored per-character settings as arrays indexed by
// position in characters.json. This is that order, frozen, so those arrays
// can be converted to name-keyed objects. Never add new characters here.
const LEGACY_ORDER = [
    "hoshino", "izuna", "kurumi", "mika", "niko", "otogi",
    "arisu", "miyu", "shizuko", "hanako", "koharu"
];

// Returns the name-keyed replacements for any old index-based settings found
// in storage, or null if there is nothing to migrate.
export function migrateLegacy(raw: Record<string, unknown>): Partial<Settings> | null {
    const patch: Partial<Settings> = {};

    const oldWeights = raw["weights"];
    if (Array.isArray(oldWeights)) {
        const weights: Record<string, number> = {};
        LEGACY_ORDER.forEach((name, i) => {
            const weight = Number(oldWeights[i]);
            if (weight >= 1) weights[name] = weight;
        });
        patch.weights = weights;
    }

    const oldImages = raw["imageOverrides"];
    if (Array.isArray(oldImages)) {
        const imageOverrides: Record<string, string> = {};
        LEGACY_ORDER.forEach((name, i) => {
            const url = oldImages[i];
            if (typeof url === "string" && url !== "") imageOverrides[name] = url;
        });
        patch.imageOverrides = imageOverrides;
    }

    const oldSingle = raw["singleIndex"];
    if (typeof oldSingle === "number") {
        patch.singleName = LEGACY_ORDER[oldSingle] ?? "";
    }

    return Object.keys(patch).length > 0 ? patch : null;
}

export function getSettings(): Promise<Settings> {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (raw) => {
            const patch = migrateLegacy(raw);
            if (patch) {
                chrome.storage.local.set(patch);
                chrome.storage.local.remove("singleIndex");
            }

            const settings = { ...DEFAULT_SETTINGS, ...raw, ...patch } as Settings;
            settings.blacklist = settings.blacklist.filter(isValidOrigin);
            resolve(settings);
        });
    });
}

// Rejects when the write fails, which mainly happens when stored local files
// push the extension past its storage quota.
export function setSettings(partial: Partial<Settings>): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(partial, () => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message ?? "storage write failed"));
            else resolve();
        });
    });
}

// Wipes everything the extension has stored, custom students and local files
// included. With storage empty, getSettings returns the defaults.
export function resetSettings(): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.clear(() => {
            const error = chrome.runtime.lastError;
            if (error) reject(new Error(error.message ?? "storage clear failed"));
            else resolve();
        });
    });
}

// Marks a JSON file as one of our settings exports.
export const EXPORT_APP = "ba-popup-interrupter";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isAssetUrl(value: unknown): value is string {
    return typeof value === "string" && /^(https?:\/\/|data:)/i.test(value);
}

// Copies the entries of `value` that pass `keep` into a fresh object.
function pickEntries<T>(value: unknown, keep: (v: unknown) => v is T): Record<string, T> {
    const out: Record<string, T> = {};
    if (!isRecord(value)) return out;
    for (const [key, v] of Object.entries(value)) {
        if (!(key in Object.prototype) && keep(v)) out[key] = v;
    }
    return out;
}

// An imported file is untrusted input: it may be hand-edited, damaged, or
// from a different version. This keeps only the fields that have the right
// type and drops everything else, so a bad file can't put the extension in a
// state the rest of the code doesn't expect.
function sanitizeSettings(raw: Record<string, unknown>): Partial<Settings> {
    const s: Partial<Settings> = {};
    const {
        enabled, mute, intervalMode, charMode, interval, intervalMin, intervalMax,
        duration, popupSize, volume, dndStart, dndEnd, blacklist, singleName, customCharacters
    } = raw;

    if (typeof enabled === "boolean") s.enabled = enabled;
    if (typeof mute === "boolean") s.mute = mute;
    if (intervalMode === "fixed" || intervalMode === "random") s.intervalMode = intervalMode;
    if (charMode === "shuffle" || charMode === "weighted" || charMode === "single") s.charMode = charMode;
    if (isNumber(interval)) s.interval = Math.max(1000, interval);
    if (isNumber(intervalMin)) s.intervalMin = Math.max(1000, intervalMin);
    if (isNumber(intervalMax)) s.intervalMax = Math.max(1000, intervalMax);
    if (isNumber(duration)) s.duration = Math.max(0, duration);
    if (isNumber(popupSize)) s.popupSize = Math.min(600, Math.max(1, popupSize));
    if (isNumber(volume)) s.volume = Math.min(1, Math.max(0, volume));

    const time = /^(\d{2}:\d{2})?$/;
    if (typeof dndStart === "string" && time.test(dndStart)) s.dndStart = dndStart;
    if (typeof dndEnd === "string" && time.test(dndEnd)) s.dndEnd = dndEnd;

    if (Array.isArray(blacklist)) {
        s.blacklist = blacklist.filter((entry): entry is string => typeof entry === "string" && isValidOrigin(entry));
    }
    if (typeof singleName === "string") s.singleName = singleName;

    s.weights = pickEntries(raw["weights"], (v): v is number => isNumber(v) && v >= 1);
    s.imageOverrides = pickEntries(raw["imageOverrides"], isAssetUrl);
    s.audioOverrides = pickEntries(raw["audioOverrides"], isAssetUrl);

    if (Array.isArray(customCharacters)) {
        const seen = new Set<string>();
        s.customCharacters = [];
        for (const entry of customCharacters) {
            if (!isRecord(entry)) continue;
            const { name, academy, image, sound } = entry;
            if (typeof name !== "string" || name === "" || name in Object.prototype || seen.has(name)) continue;
            if (!isAssetUrl(image) || !isAssetUrl(sound)) continue;
            seen.add(name);
            const custom: CustomCharacter = {
                name,
                academy: typeof academy === "string" && academy !== "" ? academy : "Custom",
                image,
                sound
            };
            if (isNumber(entry["gain"])) custom.gain = Math.min(1, Math.max(0, entry["gain"]));
            s.customCharacters.push(custom);
        }
    }

    return s;
}

// Turns the text of an export file into a complete Settings object, or throws
// an Error whose message can be shown to the user. Anything the file leaves
// out falls back to its default.
export function parseImport(text: string): Settings {
    let file: unknown;
    try {
        file = JSON.parse(text);
    } catch {
        throw new Error("That file is not valid JSON.");
    }

    if (!isRecord(file) || file["app"] !== EXPORT_APP || !isRecord(file["settings"])) {
        throw new Error("That file is not a BA Pop-Up Interrupter settings export.");
    }

    const raw = file["settings"];
    return { ...DEFAULT_SETTINGS, ...sanitizeSettings({ ...raw, ...migrateLegacy(raw) }) };
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
