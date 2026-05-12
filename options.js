const defaults = [
    { name: "Mika",    image: "images/mika.png" },
    { name: "Hoshino", image: "images/hoshino.png" },
    { name: "Izuna",   image: "images/izuna.png" }
];

function renderCharacters(overrides) {
    const list = document.getElementById("character-list");
    list.innerHTML = "";

    defaults.forEach((character, i) => {
        const saved = overrides[i] || "";

        const li = document.createElement("li");

        const preview = document.createElement("img");
        preview.src = saved || chrome.runtime.getURL(character.image);

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = character.image;
        input.value = saved;
        input.dataset.index = i;

        input.addEventListener("input", () => {
            const val = input.value.trim();
            preview.src = val || chrome.runtime.getURL(character.image);
        });

        const label = document.createElement("label");
        label.textContent = character.name;

        li.appendChild(preview);
        li.appendChild(label);
        li.appendChild(input);
        list.appendChild(li);
    });
}

chrome.storage.local.get(["interval", "imageOverrides"], (res) => {
    if (res.interval) document.getElementById("interval").value = res.interval;
    renderCharacters(res.imageOverrides || []);
});

document.getElementById("save").onclick = () => {
    const value = Number(document.getElementById("interval").value);

    if (value < 1000) {
        alert("Minimum interval is 1000ms (1 second).");
        return;
    }

    const inputs = document.querySelectorAll("#character-list input");
    const imageOverrides = Array.from(inputs).map(i => i.value.trim());

    chrome.storage.local.set({ interval: value, imageOverrides }, () => {
        const btn = document.getElementById("save");
        const original = btn.textContent;
        btn.textContent = "Saved!";
        btn.disabled = true;
        setTimeout(() => {
            btn.textContent = original;
            btn.disabled = false;
        }, 1500);
    });
};
