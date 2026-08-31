// Chrome's MV3 schema hard-rejects "background.scripts" ("requires manifest
// version of 2 or lower"), while Firefox doesn't implement
// "background.service_worker" at all (https://bugzil.la/1573659) and reads
// "background.scripts" instead. One manifest.json can't satisfy both, so
// this copies the extension into dist-firefox/ with a background field
// swapped to the Firefox shape, leaving the committed manifest.json
// Chrome-only.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// fs.cpSync refuses to copy a directory into its own subdirectory, so this
// has to live outside root rather than at e.g. root/dist-firefox.
const OUT_DIR = resolve(root, "..", "ba-popup-interrupter-dist-firefox");

// Same "runtime files only" set as web-ext-config.cjs's ignoreFiles.
const EXCLUDE = new Set([
    "node_modules", ".git", "web-ext-artifacts",
    "scripts", "tsconfig.json", "package.json", "package-lock.json",
    "README.md", "LICENSE", "web-ext-config.cjs", ".gitignore"
]);
const EXCLUDE_EXT = [".ts", ".d.ts", ".d.ts.map", ".js.map"];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

cpSync(root, OUT_DIR, {
    recursive: true,
    filter: (src) => {
        const rel = src.slice(root.length + 1);
        if (rel === "") return true;
        const top = rel.split(/[\\/]/)[0];
        if (EXCLUDE.has(top)) return false;
        if (EXCLUDE_EXT.some(ext => rel.endsWith(ext))) return false;
        return true;
    }
});

const manifestPath = join(OUT_DIR, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const { service_worker, ...rest } = manifest.background;
manifest.background = { scripts: [service_worker], ...rest };

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote ${OUT_DIR} with Firefox-shaped background.scripts`);
