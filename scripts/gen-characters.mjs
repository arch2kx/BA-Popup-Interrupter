// Generates characters.json from the files on disk, so adding a character is
// "drop in an image and a sound" rather than "hand-edit an array".
//
// MV3 extensions have no runtime filesystem access — chrome.runtime
// .getPackageDirectoryEntry() was the MV2 way and is gone — so the roster has
// to be baked at build time. This is that build step.
//
// Convention: images/actual-popup/<name>.png pairs with the sound in sounds/
// named <name>.mp3 or <name>-<anything>.mp3. Each name also needs an entry in
// scripts/academies.json, which the options page uses for grouping.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const IMAGE_DIR = "images/actual-popup";
const SOUND_DIR = "sounds";
const OUTPUT = "characters.json";
const ACADEMIES = "scripts/academies.json";

// Images that live in the popup folder but aren't characters.
const IGNORE = new Set(["sensei-placeholder"]);

// Mean volume in dB, via ffmpeg's volumedetect. Deliberately not EBU R128:
// these clips are well under R128's 400ms gating block, so integrated LUFS
// reads as garbage (-70) for the short ones. Plain RMS works at any length.
// Returns null if ffmpeg isn't installed.
function meanVolumeDb(file) {
    // ffmpeg writes volumedetect's report to stderr, not stdout.
    const result = spawnSync(
        "ffmpeg",
        ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"],
        { encoding: "utf8" }
    );
    if (result.error) return null;   // ffmpeg not installed

    const match = /mean_volume:\s*(-?[\d.]+) dB/.exec(result.stderr ?? "");
    return match ? Number(match[1]) : null;
}

// Equalizes perceived loudness. HTMLMediaElement.volume can only attenuate
// (0..1), never boost, so everything is pulled down to match the QUIETEST
// clip. That keeps every gain <= 1 and guarantees no clipping.
function computeGains(characters) {
    const levels = characters.map(c => meanVolumeDb(join(root, c.sound)));

    if (levels.some(l => l === null)) {
        console.warn("warning: ffmpeg unavailable or unreadable audio — gains default to 1.0 (no equalization)");
        return characters.map(() => 1);
    }

    const target = Math.min(...levels);
    return levels.map(level => Number(Math.pow(10, (target - level) / 20).toFixed(3)));
}

const sounds = readdirSync(join(root, SOUND_DIR)).filter(f => f.endsWith(".mp3"));

const academies = JSON.parse(readFileSync(join(root, ACADEMIES), "utf8"));

const found = readdirSync(join(root, IMAGE_DIR))
    .filter(f => f.endsWith(".png"))
    .map(f => f.slice(0, -".png".length))
    .filter(name => !IGNORE.has(name))
    .sort();

// Characters already in characters.json keep their position and new ones are
// appended. Settings are keyed by name, so nothing depends on this order; it
// just keeps the generated file's diffs small.
const previous = existsSync(join(root, OUTPUT))
    ? JSON.parse(readFileSync(join(root, OUTPUT), "utf8")).map(c => c.name)
    : [];

const names = [
    ...previous.filter(name => found.includes(name)),
    ...found.filter(name => !previous.includes(name))
];

const characters = [];
const errors = [];

for (const name of names) {
    const academy = academies[name];
    if (!academy) errors.push(`${name}: no academy set (add it to ${ACADEMIES})`);

    const matches = sounds.filter(f => f === `${name}.mp3` || f.startsWith(`${name}-`));

    if (matches.length === 0) {
        errors.push(`${name}: no sound found (expected ${SOUND_DIR}/${name}.mp3 or ${SOUND_DIR}/${name}-*.mp3)`);
        continue;
    }
    if (matches.length > 1) {
        errors.push(`${name}: ambiguous, matches ${matches.join(", ")}`);
        continue;
    }

    characters.push({
        name,
        academy,
        image: `${IMAGE_DIR}/${name}.png`,
        sound: `${SOUND_DIR}/${matches[0]}`
    });
}

// Fail loudly rather than silently dropping a character: a typo'd filename
// should stop the build, not quietly vanish from the roster.
if (errors.length > 0) {
    console.error("gen-characters failed:");
    for (const e of errors) console.error(`  ${e}`);
    console.error(`\nAdd the missing file, or add the name to IGNORE in scripts/gen-characters.mjs.`);
    process.exit(1);
}

const gains = computeGains(characters);
characters.forEach((c, i) => { c.gain = gains[i]; });

writeFileSync(join(root, OUTPUT), JSON.stringify(characters, null, 4) + "\n");
console.log(`wrote ${OUTPUT} — ${characters.length} characters:`);
for (const c of characters) console.log(`  ${c.name} (${c.academy}, gain ${c.gain})`);
