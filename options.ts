import { CHARACTERS, getSettings, setSettings, type Settings } from "./shared.js";

function updateintervalui(mode: string): void {
    const fixedel = document.getElementById("fixed-interval");
    const randomel = document.getElementById("random-interval");

    if (fixedel) fixedel.style.display = mode === "fixed" ? "grid" : "none";
    if (randomel) randomel.style.display = mode === "random" ? "grid" : "none";
}

function updatecharacterui(mode: Settings["charMode"]): void {
    document.querySelectorAll<HTMLElement>(".weight-control").forEach(el => {
        el.style.display = mode === "weighted" ? "flex" : "none";
    });
    document.querySelectorAll<HTMLElement>(".single-control").forEach(el => {
        el.style.display = mode === "single" ? "flex" : "none";
    });
}

// Renders one <li> per character into #character-list, with an image
// override field, a weight field (weighted mode), and a "use this
// character" radio (single mode).
function rendercharacters(settings: Settings): void {
    const list = document.getElementById("character-list");
    if (!list) return;

    list.innerHTML = "";

    CHARACTERS.forEach((character, i) => {
        const li = document.createElement("li");

        const img = document.createElement("img");
        img.src = chrome.runtime.getURL(character.image);
        img.alt = character.name;
        li.appendChild(img);

        const name = document.createElement("span");
        name.textContent = character.name;
        li.appendChild(name);

        const urlInput = document.createElement("input");
        urlInput.type = "text";
        urlInput.placeholder = "Image URL override";
        urlInput.dataset["urlIndex"] = String(i);
        urlInput.value = settings.imageOverrides[i] ?? "";
        li.appendChild(urlInput);

        const weightWrap = document.createElement("div");
        weightWrap.className = "weight-control";
        const weightLabel = document.createElement("label");
        weightLabel.textContent = "Weight";
        const weightInput = document.createElement("input");
        weightInput.type = "Number";
        weightInput.min = "1";
        weightInput.dataset["weightIndex"] = String(i);
        weightInput.value = String(settings.weights[i] ?? 1);
        weightWrap.appendChild(weightLabel);
        weightWrap.appendChild(weightInput);
        li.appendChild(weightWrap);

        const singleWrap = document.createElement("div");
        singleWrap.className = "single-control";
        const singleLabel = document.createElement("label");
        const singleRadio = document.createElement("input");
        singleRadio.type = "radio";
        singleRadio.name = "singlechar";
        singleRadio.value = String(i);
        singleRadio.checked = settings.singleIndex === i;
        singleLabel.appendChild(singleRadio);
        singleLabel.appendChild(document.createTextNode(" Use this character"));
        singleWrap.appendChild(singleLabel);
        li.appendChild(singleWrap);

        list.appendChild(li);
    });

    updatecharacterui(settings.charMode);
}

document.querySelectorAll<HTMLInputElement>("[name=intervalMode]").forEach(r => {
    r.addEventListener("change", () => updateintervalui(r.value));
});

document.querySelectorAll<HTMLInputElement>("[name=charMode]").forEach(r => {
    r.addEventListener("change", () => updatecharacterui(r.value as Settings["charMode"]));
});

getSettings().then((settings) => {
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

    rendercharacters(settings);

    const muteInput = document.getElementById("mute") as HTMLInputElement | null;
    if (muteInput) muteInput.checked = settings.mute;

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

        const imageOverrides = Array.from(document.querySelectorAll<HTMLInputElement>("[data-url-index]"))
                                    .map(i => i.value.trim());
        const weights        = Array.from(document.querySelectorAll<HTMLInputElement>("[data-weight-index]"))
                                    .map(i => Number(i.value) || 1);

        const singlecharradio = document.querySelector<HTMLInputElement>("[name=singlechar]:checked");
        const singleIndex     = Number(singlecharradio?.value ?? 0);

        setSettings({
            intervalMode, interval, intervalMin, intervalMax,
            duration, popupSize,
            charMode, imageOverrides, weights, singleIndex,
            mute, dndStart, dndEnd, blacklist
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
        });
    };
}
