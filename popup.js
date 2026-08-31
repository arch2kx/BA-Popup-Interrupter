import { getSettings, setSettings, isBlacklisted } from "./shared.js";
const toggleBtn = document.getElementById("toggle");
const muteInput = document.getElementById("mute");
const blockSiteBtn = document.getElementById("block-site");
const openOptionsBtn = document.getElementById("open-options");
async function getActiveTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url ?? null;
    if (!url)
        return null;
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
}
function originOf(url) {
    try {
        return new URL(url).origin;
    }
    catch {
        return url;
    }
}
async function init() {
    const settings = await getSettings();
    if (toggleBtn) {
        toggleBtn.textContent = settings.enabled ? "Enabled" : "Disabled";
    }
    if (muteInput) {
        muteInput.checked = settings.mute;
    }
    if (blockSiteBtn) {
        const url = await getActiveTabUrl();
        const blacklisted = url ? isBlacklisted(url, settings.blacklist) : false;
        blockSiteBtn.textContent = blacklisted ? "Unblock this site" : "Block this site";
        blockSiteBtn.disabled = !url;
    }
}
if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
        const settings = await getSettings();
        const enabled = !settings.enabled;
        toggleBtn.textContent = enabled ? "Enabled" : "Disabled";
        await setSettings({ enabled });
    });
}
if (muteInput) {
    muteInput.addEventListener("change", async () => {
        await setSettings({ mute: muteInput.checked });
    });
}
if (blockSiteBtn) {
    blockSiteBtn.addEventListener("click", async () => {
        const url = await getActiveTabUrl();
        if (!url)
            return;
        const settings = await getSettings();
        const blacklisted = isBlacklisted(url, settings.blacklist);
        const blacklist = blacklisted
            ? settings.blacklist.filter(entry => !url.startsWith(entry))
            : [...settings.blacklist, originOf(url)];
        await setSettings({ blacklist });
        blockSiteBtn.textContent = blacklisted ? "Block this site" : "Unblock this site";
    });
}
if (openOptionsBtn) {
    openOptionsBtn.addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
    });
}
init();
//# sourceMappingURL=popup.js.map