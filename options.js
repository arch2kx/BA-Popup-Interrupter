import { CHARACTERS, getSettings, setSettings } from "./shared.js";
function updateintervalui(mode) {
    const fixedel = document.getElementById("fixed-interval");
    const randomel = document.getElementById("random-interval");
    if (fixedel)
        fixedel.style.display = mode === "fixed" ? "grid" : "none";
    if (randomel)
        randomel.style.display = mode === "random" ? "grid" : "none";
}
function updatecharacterui(mode) {
    document.querySelectorAll(".weight-control").forEach(el => {
        el.style.display = mode === "weighted" ? "flex" : "none";
    });
    document.querySelectorAll(".single-control").forEach(el => {
        el.style.display = mode === "single" ? "flex" : "none";
    });
}
// Renders one <li> per character into #character-list, with an image
// override field, a weight field (weighted mode), and a "use this
// character" radio (single mode).
function rendercharacters(settings) {
    const list = document.getElementById("character-list");
    if (!list)
        return;
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
document.querySelectorAll("[name=intervalMode]").forEach(r => {
    r.addEventListener("change", () => updateintervalui(r.value));
});
document.querySelectorAll("[name=charMode]").forEach(r => {
    r.addEventListener("change", () => updatecharacterui(r.value));
});
getSettings().then((settings) => {
    const intervalmoderadio = document.querySelector(`[name=intervalMode][value="${settings.intervalMode}"]`);
    if (intervalmoderadio)
        intervalmoderadio.checked = true;
    updateintervalui(settings.intervalMode);
    const intervalinput = document.getElementById("interval");
    if (intervalinput)
        intervalinput.value = String(settings.interval);
    const intervalmininput = document.getElementById("intervalMin");
    if (intervalmininput)
        intervalmininput.value = String(settings.intervalMin);
    const intervalmaxinput = document.getElementById("intervalMax");
    if (intervalmaxinput)
        intervalmaxinput.value = String(settings.intervalMax);
    const durationinput = document.getElementById("duration");
    if (durationinput)
        durationinput.value = String(settings.duration);
    const popupsizeinput = document.getElementById("popupSize");
    if (popupsizeinput)
        popupsizeinput.value = String(settings.popupSize);
    const charmoderadio = document.querySelector(`[name=charMode][value="${settings.charMode}"]`);
    if (charmoderadio)
        charmoderadio.checked = true;
    rendercharacters(settings);
    const muteInput = document.getElementById("mute");
    if (muteInput)
        muteInput.checked = settings.mute;
    const dndstartinput = document.getElementById("dndStart");
    if (dndstartinput)
        dndstartinput.value = settings.dndStart;
    const dndendinput = document.getElementById("dndEnd");
    if (dndendinput)
        dndendinput.value = settings.dndEnd;
    const blacklistinput = document.getElementById("blacklist");
    if (blacklistinput)
        blacklistinput.value = settings.blacklist.join("\n");
});
const savebtn = document.getElementById("save");
if (savebtn) {
    savebtn.onclick = () => {
        const intervalmoderadio = document.querySelector("[name=intervalMode]:checked");
        const intervalMode = (intervalmoderadio ? intervalmoderadio.value : "fixed");
        const intervalel = document.getElementById("interval");
        const interval = Number(intervalel?.value ?? 0);
        const intervalminel = document.getElementById("intervalMin");
        const intervalMin = Number(intervalminel?.value ?? 0);
        const intervalmaxel = document.getElementById("intervalMax");
        const intervalMax = Number(intervalmaxel?.value ?? 0);
        const durationel = document.getElementById("duration");
        const duration = Number(durationel?.value ?? 0);
        const popupsizeel = document.getElementById("popupSize");
        const popupSize = Math.min(600, Number(popupsizeel?.value ?? 0));
        const charmoderadio = document.querySelector("[name=charMode]:checked");
        const charMode = (charmoderadio ? charmoderadio.value : "shuffle");
        const muteel = document.getElementById("mute");
        const mute = muteel ? muteel.checked : false;
        const dndstartel = document.getElementById("dndStart");
        const dndStart = dndstartel ? dndstartel.value : "";
        const dndendel = document.getElementById("dndEnd");
        const dndEnd = dndendel ? dndendel.value : "";
        const blacklistel = document.getElementById("blacklist");
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
        const imageOverrides = Array.from(document.querySelectorAll("[data-url-index]"))
            .map(i => i.value.trim());
        const weights = Array.from(document.querySelectorAll("[data-weight-index]"))
            .map(i => Number(i.value) || 1);
        const singlecharradio = document.querySelector("[name=singlechar]:checked");
        const singleIndex = Number(singlecharradio?.value ?? 0);
        setSettings({
            intervalMode, interval, intervalMin, intervalMax,
            duration, popupSize,
            charMode, imageOverrides, weights, singleIndex,
            mute, dndStart, dndEnd, blacklist
        }).then(() => {
            const btn = document.getElementById("save");
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
//# sourceMappingURL=options.js.map