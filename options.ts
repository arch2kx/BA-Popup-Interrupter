import {
    EXPORT_APP, assetUrl, getAllCharacters, getSettings, parseImport, resetSettings, setSettings,
    type Character, type CustomCharacter, type Settings
} from "./shared.js";

// Page state the add/remove handlers need after the first render.
let currentsettings: Settings | null = null;
let customcharacters: CustomCharacter[] = [];
let knownnames = new Set<string>();

const MAX_IMAGE_SIDE = 600;
const KEEP_IMAGE_BYTES = 300 * 1024;
const MAX_AUDIO_BYTES = 1024 * 1024;

// A local file is stored as a data: URL, which can be hundreds of thousands
// of characters long. It is kept here, next to its text input, so the input
// itself can just show the file's name.
const filedata = new WeakMap<HTMLInputElement, string>();

function fieldvalue(input: HTMLInputElement): string {
    return filedata.get(input) ?? input.value.trim();
}

function setfieldfile(input: HTMLInputElement, dataurl: string, label: string): void {
    filedata.set(input, dataurl);
    input.value = label;
    input.readOnly = true;
    input.dispatchEvent(new Event("filechange"));
}

function clearfieldfile(input: HTMLInputElement): void {
    filedata.delete(input);
    input.value = "";
    input.readOnly = false;
    input.dispatchEvent(new Event("filechange"));
}

// Fills a field from a saved setting, which is either a normal URL or a
// data: URL from an earlier file pick.
function setfieldinitial(input: HTMLInputElement, value: string): void {
    if (value.startsWith("data:")) setfieldfile(input, value, "Local file");
    else input.value = value;
}

function readasdataurl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("That file could not be read."));
        reader.readAsDataURL(blob);
    });
}

// Popups are capped at 600px, so storing anything larger is wasted space.
// Big images are redrawn onto a canvas at that size. Small ones are kept
// as they are, which also keeps animated GIFs animated.
async function imagefiletodataurl(file: File): Promise<string> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        throw new Error("That file is not an image the browser can read.");
    }

    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_SIDE && file.size <= KEEP_IMAGE_BYTES) {
        bitmap.close();
        return readasdataurl(file);
    }

    const scale = Math.min(1, MAX_IMAGE_SIDE / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/webp", 0.9);
}

function audiofiletodataurl(file: File): Promise<string> {
    if (file.size > MAX_AUDIO_BYTES) {
        return Promise.reject(new Error("Audio files need to be under 1 MB."));
    }
    return readasdataurl(file);
}

// Wraps a URL text input together with a button that fills it from a local
// file instead. The button turns into "Clear file" while a file is set.
function withfilepicker(input: HTMLInputElement, kind: "image" | "audio", onerror: (message: string) => void): HTMLElement {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = kind === "image" ? "image/*" : "audio/*";
    picker.hidden = true;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "url-toggle";

    const refresh = (): void => {
        button.textContent = filedata.has(input) ? "Clear file" : "Choose file";
    };
    input.addEventListener("filechange", refresh);
    refresh();

    button.addEventListener("click", () => {
        if (filedata.has(input)) clearfieldfile(input);
        else picker.click();
    });

    picker.addEventListener("change", async () => {
        const file = picker.files?.[0];
        picker.value = "";
        if (!file) return;

        try {
            const dataurl = kind === "image"
                ? await imagefiletodataurl(file)
                : await audiofiletodataurl(file);
            setfieldfile(input, dataurl, `Local file: ${file.name}`);
        } catch (err) {
            onerror(err instanceof Error ? err.message : "That file could not be read.");
        }
    });

    const wrap = document.createElement("div");
    wrap.className = "file-field";
    wrap.append(input, picker, button);
    return wrap;
}

function updateintervalui(mode: string): void {
    const fixedel = document.getElementById("fixed-interval");
    const randomel = document.getElementById("random-interval");

    if (fixedel) fixedel.style.display = mode === "fixed" ? "grid" : "none";
    if (randomel) randomel.style.display = mode === "random" ? "grid" : "none";
}

// Drives the readout and --pct, the unitless percentage the CSS uses for both
// the track fill and the bubble's position. Chrome has no
// ::-moz-range-progress equivalent, so the fill has to come from a gradient
// stop computed here. Set on the wrapper so the bubble can read it too.
function updatevolumeui(input: HTMLInputElement): void {
    const label = document.getElementById("volume-value");
    if (label) label.textContent = `${input.value}%`;
    const wrap = input.closest<HTMLElement>(".slider");
    if (wrap) wrap.style.setProperty("--pct", input.value);
}

function updatecharacterui(mode: Settings["charMode"]): void {
    document.querySelectorAll<HTMLElement>(".weight-control").forEach(el => {
        el.style.display = mode === "weighted" ? "flex" : "none";
    });
    document.querySelectorAll<HTMLElement>(".single-control").forEach(el => {
        el.style.display = mode === "single" ? "flex" : "none";
    });
}

// The "Customize" button that shows or hides a row's extra panel.
function customizetoggle(panel: HTMLElement, focus: HTMLElement): HTMLButtonElement {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "url-toggle";
    toggle.textContent = "Customize";
    toggle.addEventListener("click", () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) focus.focus();
    });
    return toggle;
}

// One row for one character. Settings are stored by character name, so the
// name is written onto every control for the save handler to read back.
function rendercharacterrow(settings: Settings, character: Character, issingle: boolean): HTMLLIElement {
    const li = document.createElement("li");
    li.dataset["name"] = character.name.toLowerCase();

    const img = document.createElement("img");
    img.src = assetUrl(character.image);
    img.alt = "";
    li.appendChild(img);

    const name = document.createElement("span");
    name.className = "character-name";
    name.textContent = character.name;
    li.appendChild(name);

    const weightWrap = document.createElement("div");
    weightWrap.className = "weight-control";
    const weightLabel = document.createElement("label");
    weightLabel.textContent = "Weight";
    const weightInput = document.createElement("input");
    weightInput.type = "Number";
    weightInput.min = "1";
    weightInput.dataset["weightName"] = character.name;
    weightInput.value = String(settings.weights[character.name] ?? 1);
    weightWrap.appendChild(weightLabel);
    weightWrap.appendChild(weightInput);
    li.appendChild(weightWrap);

    const singleWrap = document.createElement("div");
    singleWrap.className = "single-control";
    const singleLabel = document.createElement("label");
    const singleRadio = document.createElement("input");
    singleRadio.type = "radio";
    singleRadio.name = "singlechar";
    singleRadio.value = character.name;
    singleRadio.checked = issingle;
    singleLabel.appendChild(singleRadio);
    singleLabel.appendChild(document.createTextNode(" Use this character"));
    singleWrap.appendChild(singleLabel);
    li.appendChild(singleWrap);

    // A custom student already is its own image and sound, so its panel
    // holds a gain field and a remove button in place of the override fields.
    if (character.custom) {
        const gainWrap = document.createElement("div");
        gainWrap.className = "gain-control";
        const gainLabel = document.createElement("label");
        gainLabel.textContent = "Gain";
        const gainInput = document.createElement("input");
        gainInput.type = "Number";
        gainInput.min = "0";
        gainInput.max = "1";
        gainInput.step = "0.05";
        gainInput.title = "Volume multiplier for this student, from 0 to 1";
        gainInput.dataset["gainName"] = character.name;
        gainInput.value = String(character.gain);
        gainWrap.appendChild(gainLabel);
        gainWrap.appendChild(gainInput);

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "url-toggle danger-button";
        removeButton.textContent = "Remove student";
        removeButton.addEventListener("click", () => removecustomcharacter(character.name, li));

        const panel = document.createElement("div");
        panel.className = "custom-fields custom-fields-row";
        panel.hidden = true;
        panel.appendChild(gainWrap);
        panel.appendChild(removeButton);

        li.appendChild(customizetoggle(panel, gainInput));
        li.appendChild(panel);
        return li;
    }

    const imageInput = document.createElement("input");
    imageInput.type = "text";
    imageInput.placeholder = "custom image URL (optional)";
    imageInput.dataset["imageName"] = character.name;
    setfieldinitial(imageInput, settings.imageOverrides[character.name] ?? "");

    const audioInput = document.createElement("input");
    audioInput.type = "text";
    audioInput.placeholder = "custom audio URL (optional)";
    audioInput.dataset["audioName"] = character.name;
    setfieldinitial(audioInput, settings.audioOverrides[character.name] ?? "");

    const customFields = document.createElement("div");
    customFields.className = "custom-fields";
    customFields.hidden = fieldvalue(imageInput) === "" && fieldvalue(audioInput) === "";
    customFields.appendChild(withfilepicker(imageInput, "image", message => alert(message)));
    customFields.appendChild(withfilepicker(audioInput, "audio", message => alert(message)));

    li.appendChild(customizetoggle(customFields, imageInput));
    li.appendChild(customFields);

    return li;
}

function updategroupcount(group: HTMLDetailsElement): void {
    const count = group.querySelector(".academy-count");
    if (count) count.textContent = String(group.querySelectorAll("li").length);
}

// Puts a row into its academy's <details> group, creating the group the first
// time that academy is seen. Academies match case-insensitively, so a custom
// student typed as "trinity" joins the existing Trinity group.
function appendtogroup(list: HTMLElement, academy: string, row: HTMLLIElement): void {
    let group = Array.from(list.querySelectorAll<HTMLDetailsElement>("details"))
        .find(d => d.dataset["academy"] === academy.toLowerCase());

    if (!group) {
        group = document.createElement("details");
        group.open = true;
        group.dataset["academy"] = academy.toLowerCase();

        const summary = document.createElement("summary");
        summary.appendChild(document.createTextNode(academy));
        const count = document.createElement("span");
        count.className = "academy-count";
        summary.appendChild(count);
        group.appendChild(summary);
        group.appendChild(document.createElement("ul"));

        list.appendChild(group);
    }

    group.querySelector("ul")?.appendChild(row);
    updategroupcount(group);
}

// Renders the characters into #character-list as one collapsible <details>
// group per academy.
function rendercharacters(settings: Settings, characters: Character[]): void {
    const list = document.getElementById("character-list");
    if (!list) return;

    list.innerHTML = "";

    // Single mode always needs one radio checked, so an unset or stale name
    // falls back to the first character, same as background.ts does.
    const singlename = characters.some(c => c.name === settings.singleName)
        ? settings.singleName
        : characters[0]?.name;

    const sorted = [...characters].sort((a, b) =>
        a.academy.toLowerCase().localeCompare(b.academy.toLowerCase()) || a.name.localeCompare(b.name));

    for (const character of sorted) {
        const row = rendercharacterrow(settings, character, character.name === singlename);
        appendtogroup(list, character.academy, row);
    }

    updatecharacterui(settings.charMode);
}

// Hides rows that match neither the character name nor the academy name.
// Rows are hidden, not removed, so the save handler still finds every input.
function filtercharacters(query: string): void {
    const q = query.trim().toLowerCase();
    let total = 0;

    document.querySelectorAll<HTMLDetailsElement>("#character-list details").forEach(group => {
        const academymatches = (group.dataset["academy"] ?? "").includes(q);
        let visible = 0;

        group.querySelectorAll<HTMLLIElement>("li").forEach(row => {
            const matches = academymatches || (row.dataset["name"] ?? "").includes(q);
            row.hidden = !matches;
            if (matches) visible++;
        });

        group.hidden = visible === 0;
        if (q !== "" && visible > 0) group.open = true;
        total += visible;
    });

    const empty = document.getElementById("character-empty");
    if (empty) empty.hidden = total > 0;
}

const searchinput = document.getElementById("character-search") as HTMLInputElement | null;
if (searchinput) {
    searchinput.addEventListener("input", () => filtercharacters(searchinput.value));
}

// Anything that isn't a number becomes 1 (no change), and the result is kept
// between 0 and 1 because an audio element's volume can't go above 1.
function parsegain(value: string): number {
    const gain = Number(value);
    if (value.trim() === "" || !Number.isFinite(gain)) return 1;
    return Math.min(1, Math.max(0, gain));
}

function ishttpurl(value: string): boolean {
    try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

// Resolves true once the browser has actually loaded the file, false on an
// error or if nothing happens within ten seconds.
function canload(url: string, kind: "image" | "audio"): Promise<boolean> {
    return new Promise(resolve => {
        setTimeout(() => resolve(false), 10000);

        if (kind === "image") {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        } else {
            const audio = new Audio();
            audio.preload = "metadata";
            audio.onloadedmetadata = () => resolve(true);
            audio.onerror = () => resolve(false);
            audio.src = url;
        }
    });
}

function setcustomstatus(message: string): void {
    const status = document.getElementById("custom-status");
    if (status) status.textContent = message;
}

// Custom students are saved straight away, separately from the Save button,
// so one can't be added and then lost by closing the page.
async function addcustomcharacter(): Promise<void> {
    const nameel    = document.getElementById("custom-name") as HTMLInputElement | null;
    const academyel = document.getElementById("custom-academy") as HTMLInputElement | null;
    const imageel   = document.getElementById("custom-image") as HTMLInputElement | null;
    const soundel   = document.getElementById("custom-sound") as HTMLInputElement | null;
    const gainel    = document.getElementById("custom-gain") as HTMLInputElement | null;
    const addbtn    = document.getElementById("custom-add") as HTMLButtonElement | null;
    const list      = document.getElementById("character-list");
    if (!nameel || !academyel || !imageel || !soundel || !addbtn || !list || !currentsettings) return;

    const name    = nameel.value.trim().toLowerCase();
    // Reuses the spelling of an existing group, so a student typed into
    // "trinity" is stored under "Trinity" like everyone else in it.
    const typed    = academyel.value.trim() || "Custom";
    const existing = Array.from(list.querySelectorAll<HTMLDetailsElement>("details"))
        .find(d => d.dataset["academy"] === typed.toLowerCase());
    const academy  = existing?.querySelector("summary")?.firstChild?.textContent ?? typed;
    const image   = fieldvalue(imageel);
    const sound   = fieldvalue(soundel);

    if (!name) return setcustomstatus("Give the student a name.");
    // Names are used as object keys in settings, so one that already means
    // something on every object (like "constructor") would misbehave.
    if (name in Object.prototype) return setcustomstatus("That name can't be used.");
    if (knownnames.has(name)) return setcustomstatus(`There is already a student called "${name}".`);
    if (!filedata.has(imageel) && !ishttpurl(image)) return setcustomstatus("The image needs to be an http(s) URL or a file.");
    if (!filedata.has(soundel) && !ishttpurl(sound)) return setcustomstatus("The audio needs to be an http(s) URL or a file.");

    setcustomstatus("Checking the image and audio...");
    addbtn.disabled = true;
    const [imageok, soundok] = await Promise.all([canload(image, "image"), canload(sound, "audio")]);
    addbtn.disabled = false;

    if (!imageok) return setcustomstatus("That image could not be loaded.");
    if (!soundok) return setcustomstatus("That audio could not be loaded.");

    const gain = parsegain(gainel?.value ?? "");
    const custom: CustomCharacter = { name, academy, image, sound, gain };
    try {
        await setSettings({ customCharacters: [...customcharacters, custom] });
    } catch {
        return setcustomstatus("Could not save. Local files may have filled the extension's storage.");
    }
    customcharacters.push(custom);
    knownnames.add(name);

    const row = rendercharacterrow(currentsettings, { ...custom, gain, custom: true }, false);
    appendtogroup(list, academy, row);

    const charmode = document.querySelector<HTMLInputElement>("[name=charMode]:checked");
    updatecharacterui((charmode?.value ?? "shuffle") as Settings["charMode"]);
    if (searchinput) filtercharacters(searchinput.value);

    nameel.value = "";
    academyel.value = "";
    clearfieldfile(imageel);
    clearfieldfile(soundel);
    if (gainel) gainel.value = "1";
    setcustomstatus(`Added ${name}.`);
}

function removecustomcharacter(name: string, row: HTMLLIElement): void {
    customcharacters = customcharacters.filter(c => c.name !== name);
    knownnames.delete(name);
    setSettings({ customCharacters: customcharacters }).catch(() => {});

    const group = row.closest<HTMLDetailsElement>("details");
    const wassingle = row.querySelector<HTMLInputElement>("[name=singlechar]")?.checked ?? false;
    row.remove();

    if (group) {
        if (group.querySelector("li")) updategroupcount(group);
        else group.remove();
    }

    // Single mode always needs one radio checked.
    if (wassingle) {
        const first = document.querySelector<HTMLInputElement>("[name=singlechar]");
        if (first) first.checked = true;
    }

    setcustomstatus(`Removed ${name}.`);
}

const customaddbtn = document.getElementById("custom-add");
if (customaddbtn) {
    customaddbtn.addEventListener("click", () => { addcustomcharacter(); });
}

// The add form's URL inputs are written in options.html, so their file
// pickers are attached here, in the same spot the input was.
for (const [id, kind] of [["custom-image", "image"], ["custom-sound", "audio"]] as const) {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) continue;
    const parent = input.parentElement;
    const next = input.nextSibling;
    parent?.insertBefore(withfilepicker(input, kind, setcustomstatus), next);
}

document.querySelectorAll<HTMLInputElement>("[name=intervalMode]").forEach(r => {
    r.addEventListener("change", () => updateintervalui(r.value));
});

document.querySelectorAll<HTMLInputElement>("[name=charMode]").forEach(r => {
    r.addEventListener("change", () => updatecharacterui(r.value as Settings["charMode"]));
});

getSettings().then(async (settings) => {
    const characters = await getAllCharacters(settings);
    currentsettings = settings;
    customcharacters = [...settings.customCharacters];
    knownnames = new Set(characters.map(c => c.name));

    const intervalmoderadio = document.querySelector<HTMLInputElement>(`[name=intervalMode][value="${settings.intervalMode}"]`);
    if (intervalmoderadio) intervalmoderadio.checked = true;
    updateintervalui(settings.intervalMode);

    const intervalinput = document.getElementById("interval") as HTMLInputElement | null;
    if (intervalinput) intervalinput.value = String(settings.interval);

    const intervalmininput = document.getElementById("intervalMin") as HTMLInputElement | null;
    if (intervalmininput) intervalmininput.value = String(settings.intervalMin);

    const intervalmaxinput = document.getElementById("intervalMax") as HTMLInputElement | null;
    if (intervalmaxinput) intervalmaxinput.value = String(settings.intervalMax);

    const durationinput = document.getElementById("duration") as HTMLInputElement | null;
    if (durationinput) durationinput.value = String(settings.duration);

    const popupsizeinput = document.getElementById("popupSize") as HTMLInputElement | null;
    if (popupsizeinput) popupsizeinput.value = String(settings.popupSize);

    const charmoderadio = document.querySelector<HTMLInputElement>(`[name=charMode][value="${settings.charMode}"]`);
    if (charmoderadio) charmoderadio.checked = true;

    rendercharacters(settings, characters);

    const muteInput = document.getElementById("mute") as HTMLInputElement | null;
    if (muteInput) muteInput.checked = settings.mute;

    const volumeinput = document.getElementById("volume") as HTMLInputElement | null;
    if (volumeinput) {
        volumeinput.value = String(Math.round(settings.volume * 100));
        updatevolumeui(volumeinput);
        volumeinput.addEventListener("input", () => updatevolumeui(volumeinput));
    }

    const dndstartinput = document.getElementById("dndStart") as HTMLInputElement | null;
    if (dndstartinput) dndstartinput.value = settings.dndStart;

    const dndendinput = document.getElementById("dndEnd") as HTMLInputElement | null;
    if (dndendinput) dndendinput.value = settings.dndEnd;

    const blacklistinput = document.getElementById("blacklist") as HTMLTextAreaElement | null;
    if (blacklistinput) blacklistinput.value = settings.blacklist.join("\n");
});

const savebtn = document.getElementById("save");
if (savebtn) {
    savebtn.onclick = () => {
        const intervalmoderadio = document.querySelector<HTMLInputElement>("[name=intervalMode]:checked");
        const intervalMode = (intervalmoderadio ? intervalmoderadio.value : "fixed") as Settings["intervalMode"];

        const intervalel = document.getElementById("interval") as HTMLInputElement | null;
        const interval = Number(intervalel?.value ?? 0);

        const intervalminel = document.getElementById("intervalMin") as HTMLInputElement | null;
        const intervalMin = Number(intervalminel?.value ?? 0);

        const intervalmaxel = document.getElementById("intervalMax") as HTMLInputElement | null;
        const intervalMax = Number(intervalmaxel?.value ?? 0);

        const durationel = document.getElementById("duration") as HTMLInputElement | null;
        const duration = Number(durationel?.value ?? 0);

        const popupsizeel = document.getElementById("popupSize") as HTMLInputElement | null;
        const popupSize = Math.min(600, Number(popupsizeel?.value ?? 0));

        const charmoderadio = document.querySelector<HTMLInputElement>("[name=charMode]:checked");
        const charMode = (charmoderadio ? charmoderadio.value : "shuffle") as Settings["charMode"];

        const muteel = document.getElementById("mute") as HTMLInputElement | null;
        const mute = muteel ? muteel.checked : false;

        const volumeel = document.getElementById("volume") as HTMLInputElement | null;
        const volume = volumeel ? Number(volumeel.value) / 100 : 1;

        const dndstartel = document.getElementById("dndStart") as HTMLInputElement | null;
        const dndStart = dndstartel ? dndstartel.value : "";

        const dndendel = document.getElementById("dndEnd") as HTMLInputElement | null;
        const dndEnd = dndendel ? dndendel.value : "";

        const blacklistel = document.getElementById("blacklist") as HTMLTextAreaElement | null;
        const blacklist = blacklistel
            ? blacklistel.value.split("\n").map(s => s.trim()).filter(Boolean)
            : [];

        if (intervalMode === "fixed" && interval < 1000) {
            alert("minimum interval is 1000ms.");
            return;
        }
        if (intervalMode === "random" && intervalMin >= intervalMax) {
            alert("min must be less than max.");
            return;
        }

        const imageOverrides: Record<string, string> = {};
        document.querySelectorAll<HTMLInputElement>("[data-image-name]").forEach(input => {
            const url = fieldvalue(input);
            if (url) imageOverrides[input.dataset["imageName"] ?? ""] = url;
        });
        const audioOverrides: Record<string, string> = {};
        document.querySelectorAll<HTMLInputElement>("[data-audio-name]").forEach(input => {
            const url = fieldvalue(input);
            if (url) audioOverrides[input.dataset["audioName"] ?? ""] = url;
        });
        const weights: Record<string, number> = {};
        document.querySelectorAll<HTMLInputElement>("[data-weight-name]").forEach(input => {
            weights[input.dataset["weightName"] ?? ""] = Number(input.value) || 1;
        });

        document.querySelectorAll<HTMLInputElement>("[data-gain-name]").forEach(input => {
            const custom = customcharacters.find(c => c.name === input.dataset["gainName"]);
            if (custom) custom.gain = parsegain(input.value);
        });

        const singlecharradio = document.querySelector<HTMLInputElement>("[name=singlechar]:checked");
        const singleName      = singlecharradio?.value ?? "";

        setSettings({
            intervalMode, interval, intervalMin, intervalMax,
            duration, popupSize,
            charMode, imageOverrides, audioOverrides, weights, singleName,
            customCharacters: customcharacters,
            mute, volume, dndStart, dndEnd, blacklist
        }).then(() => {
            const btn = document.getElementById("save") as HTMLButtonElement | null;
            if (btn) {
                btn.textContent = "Saved!";
                btn.disabled = true;
                setTimeout(() => {
                    btn.textContent = "Save";
                    btn.disabled = false;
                }, 1500);
            }
        }).catch(() => {
            alert("Could not save. Local files may have filled the extension's storage.");
        });
    };
}

// Exports what is saved in storage, so unsaved edits on the page are not
// included. The file is built in memory and handed to the browser as a
// download through a temporary link.
async function exportsettings(): Promise<void> {
    const file = {
        app: EXPORT_APP,
        version: chrome.runtime.getManifest().version,
        exported: new Date().toISOString(),
        settings: await getSettings()
    };

    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `bapi-settings-${file.exported.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

async function importsettings(file: File): Promise<void> {
    try {
        const settings = parseImport(await file.text());

        if (!confirm(`Replace your current settings with the ones from "${file.name}"? This can't be undone.`)) return;

        await setSettings(settings);
        location.reload();
    } catch (err) {
        alert(err instanceof Error ? `Could not import: ${err.message}` : "Could not import that file.");
    }
}

const exportbtn = document.getElementById("export");
if (exportbtn) {
    exportbtn.addEventListener("click", () => { exportsettings(); });
}

const importbtn  = document.getElementById("import");
const importfile = document.getElementById("import-file") as HTMLInputElement | null;
if (importbtn && importfile) {
    importbtn.addEventListener("click", () => importfile.click());
    importfile.addEventListener("change", () => {
        const file = importfile.files?.[0];
        importfile.value = "";
        if (file) importsettings(file);
    });
}

const resetbtn = document.getElementById("reset");
if (resetbtn) {
    resetbtn.addEventListener("click", async () => {
        const message = "Reset all settings to their defaults?\n\n"
            + "This also deletes your custom students and local files, and can't be undone. "
            + "Use Export first if you want a backup.";
        if (!confirm(message)) return;

        try {
            await resetSettings();
            location.reload();
        } catch {
            alert("Could not reset the settings.");
        }
    });
}
