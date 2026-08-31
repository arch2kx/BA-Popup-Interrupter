export interface Character {
    name: string;
    image: string;
    sound: string;
    gain: number;
}
export declare function getCharacters(): Promise<Character[]>;
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
export declare const DEFAULT_SETTINGS: Settings;
export declare function getSettings(): Promise<Settings>;
export declare function setSettings(partial: Partial<Settings>): Promise<void>;
export declare function isDnd(dndStart: string, dndEnd: string): boolean;
export declare function isBlacklisted(url: string, blacklist: string[]): boolean;
//# sourceMappingURL=shared.d.ts.map