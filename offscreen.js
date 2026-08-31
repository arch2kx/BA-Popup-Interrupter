"use strict";
chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "play-sound-offscreen")
        return;
    const audio = new Audio(message.sound);
    // Clamp defensively: .volume throws a RangeError outside 0..1, and this
    // value crosses a message boundary.
    audio.volume = typeof message.volume === "number"
        ? Math.min(1, Math.max(0, message.volume))
        : 1;
    audio.play().catch(() => { });
});
//# sourceMappingURL=offscreen.js.map