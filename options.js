const defaults = [
    { name: "Mika",    image: "images/mika.png" },
    { name: "Hoshino", image: "images/hoshino.png" },
    { name: "Izuna",   image: "images/izuna.png" }
];

function updateIntervalUI(mode) {
    document.getElementById("fixed-interval").style.display  = mode === "fixed"  ? "block" : "none";
    document.getElementById("random-interval").style.display = mode === "random" ? "block" : "none";
}

document.querySelectorAll("[name=intervalMode]").forEach(r => {
    r.addEventListener("change", () => updateIntervalUI(r.value));
});

function renderCharacters(overrides, weights, singleIndex) {
    const list = document.getElementById("character-list");
    list.innerHTML = "";

    defaults.forEach((character, i) => {
        const li = document.createElement("li");

        const preview = document.createElement("img");
        preview.src = (overrides && overrides[i]) || chrome.runtime.getURL(character.image);

        const nameLabel = document.createElement("span");
        nameLabel.textContent = character.name;

        // Radio button for single character mode.
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "singleChar";
        radio.value = i;
        radio.checked = singleIndex === i;

        // Weight input — how many times this character appears in the deck.
        const weightInput = document.createElement("input");
        weightInput.type = "number";
        weightInput.min = 1;
        weightInput.max = 10;
        weightInput.value = (weights && weights[i]) || 1;
        weightInput.dataset.weightIndex = i;
        weightInput.placeholder = "weight";

        // Custom image URL override.
        const urlInput = document.createElement("input");
        urlInput.type = "text";
        urlInput.placeholder = "Custom image URL (optional)";
        urlInput.value = (overrides && overrides[i]) || "";
        urlInput.dataset.urlIndex = i;

        urlInput.addEventListener("input", () => {
            preview.src = urlInput.value.trim() || chrome.runtime.getURL(character.image);
        });

        li.appendChild(preview);
        li.appendChild(nameLabel);
        li.appendChild(radio);
        li.appendChild(weightInput);
        li.appendChild(urlInput);
        list.appendChild(li);
    });
}

chrome.storage.local.get([
    "intervalMode", "interval", "intervalMin", "intervalMax",
    "duration", "popupSize",
    "charMode", "imageOverrides", "weights", "singleIndex",
    "mute", "dndStart", "dndEnd", "blacklist"
], (res) => {
    const mode = res.intervalMode || "fixed";
    document.querySelector(`[name=intervalMode][value=${mode}]`).checked = true;
    updateIntervalUI(mode);

    document.getElementById("interval").value    = res.interval    || 5000;
    document.getElementById("intervalMin").value = res.intervalMin || 3000;
    document.getElementById("intervalMax").value = res.intervalMax || 15000;
    document.getElementById("duration").value    = res.duration    || 3000;
    document.getElementById("popupSize").value   = res.popupSize   || 400;

    const charMode = res.charMode || "shuffle";
    document.querySelector(`[name=charMode][value=${charMode}]`).checked = true;

    renderCharacters(res.imageOverrides, res.weights, res.singleIndex ?? 0);

    document.getElementById("mute").checked    = res.mute      || false;
    document.getElementById("dndStart").value  = res.dndStart  || "";
    document.getElementById("dndEnd").value    = res.dndEnd    || "";
    document.getElementById("blacklist").value = (res.blacklist || []).join("\n");
});

document.getElementById("save").onclick = () => {
    const intervalMode = document.querySelector("[name=intervalMode]:checked").value;
    const interval     = Number(document.getElementById("interval").value);
    const intervalMin  = Number(document.getElementById("intervalMin").value);
    const intervalMax  = Number(document.getElementById("intervalMax").value);
    const duration     = Number(document.getElementById("duration").value);
    const popupSize    = Math.min(800, Number(document.getElementById("popupSize").value));
    const charMode     = document.querySelector("[name=charMode]:checked").value;
    const mute         = document.getElementById("mute").checked;
    const dndStart     = document.getElementById("dndStart").value;
    const dndEnd       = document.getElementById("dndEnd").value;
    const blacklist    = document.getElementById("blacklist").value
                            .split("\n").map(s => s.trim()).filter(Boolean);

    if (intervalMode === "fixed" && interval < 1000) {
        alert("Minimum interval is 1000ms.");
        return;
    }
    if (intervalMode === "random" && intervalMin >= intervalMax) {
        alert("Min must be less than Max.");
        return;
    }

    const imageOverrides = Array.from(document.querySelectorAll("[data-url-index]"))
                                .map(i => i.value.trim());
    const weights        = Array.from(document.querySelectorAll("[data-weight-index]"))
                                .map(i => Number(i.value) || 1);
    const singleIndex    = Number(document.querySelector("[name=singleChar]:checked")?.value ?? 0);

    chrome.storage.local.set({
        intervalMode, interval, intervalMin, intervalMax,
        duration, popupSize,
        charMode, imageOverrides, weights, singleIndex,
        mute, dndStart, dndEnd, blacklist
    }, () => {
        const btn = document.getElementById("save");
        btn.textContent = "Saved!";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = "Save"; btn.disabled = false; }, 1500);
    });
};
