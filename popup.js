const btn = document.getElementById("toggle");

chrome.storage.local.get(["enabled"], (res) => {
    const enabled = res.enabled || false;
    btn.textContent = enabled ? "ON" : "OFF";
});

btn.addEventListener("click", () => {
    chrome.storage.local.get(["enabled"], (res) => {
        const enabled = !(res.enabled || false);
        btn.textContent = enabled ? "ON" : "OFF";
        chrome.storage.local.set({ enabled });
    });
});
